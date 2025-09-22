package backend.server.structures

import javax.inject.{Inject, Singleton}
import backend.server.database.Database
import backend.server.motifs.MotifsMetadata
import backend.server.motifs.api.filter.MotifsSearchTreeFilter
import backend.server.structures.api.cdr3.{StructureCDR3SearchEntry, StructureCDR3SearchResult, StructureCDR3SearchResultOptions}
import backend.server.structures.api.epitope.{StructureCluster, StructureClusterMeta, StructureEpitope}
import backend.server.structures.api.filter.StructuresSearchTreeFilterResult
import backend.utils.CommonUtils
import play.api.libs.json._
import tech.tablesaw.api.{ColumnType, StringColumn, Table}
import tech.tablesaw.io.csv.CsvReadOptions
import java.nio.file.{Files, Path, Paths}
import java.util.Locale
import scala.collection.JavaConverters._
import scala.collection.mutable

import scala.concurrent.{ExecutionContext, Future}

@Singleton
case class Structures @Inject()(database: Database)(implicit ec: ExecutionContext) {

  private val structureImagesDir: Path = Structures.resolveImageRoot(database)
  private val maxTopValueInCDR3Search: Int = 15

  // ---------- load vdjdb.txt ----------
  private def loadVdjdb(): Table = {
    val path = database.getLocation + "/vdjdb.txt"
    val columnTypes: Array[ColumnType] = Array(
      ColumnType.SKIP,   // complex.id
      ColumnType.STRING, // gene
      ColumnType.STRING, // cdr3
      ColumnType.STRING, // v.segm
      ColumnType.STRING, // j.segm
      ColumnType.STRING, // species
      ColumnType.STRING, // mhc.a
      ColumnType.STRING, // mhc.b
      ColumnType.STRING, // mhc.class
      ColumnType.STRING, // antigen.epitope
      ColumnType.STRING, // antigen.gene
      ColumnType.STRING, // antigen.species
      ColumnType.SKIP,   // reference.id
      ColumnType.SKIP,   // method
      ColumnType.STRING, // meta
      ColumnType.SKIP,   // cdr3fix
      ColumnType.SKIP,   // vdjdb.score
      ColumnType.SKIP,   // web.method
      ColumnType.SKIP,   // web.method.seq
      ColumnType.SKIP,   // web.cdr3fix.nc
      ColumnType.SKIP    // web.cdr3fix.unmp
    )

    val opts = CsvReadOptions
      .builder(path)
      .separator('\t')
      .header(true)
      .columnTypes(columnTypes)
      .sample(false)
      .build() // TSV with header
    val table = Table.read().csv(opts)

    if (table.columnNames().contains("mhc.a")) {
      val trimmed = table.stringColumn("mhc.a").replaceAll(":.+", "").setName("mhc.a")
      table.replaceColumn("mhc.a", trimmed)
    }
    if (table.columnNames().contains("mhc.b")) {
      val trimmed = table.stringColumn("mhc.b").replaceAll(":.+", "").setName("mhc.b")
      table.replaceColumn("mhc.b", trimmed)
    }

    table  // tech.tablesaw read using options
  }

  private val raw: Table = loadVdjdb()

  // ---------- derive columns from JSON in "meta" ----------
  private def getMetaCol(t: Table): StringColumn =
    if (t.columnNames().contains("meta")) t.stringColumn("meta")
    else StringColumn.create("meta") // empty fallback

  private def pickFromJson(metaStr: String, keys: Seq[String]): String = {
    if (metaStr == null || metaStr.isEmpty) return ""
    val js = scala.util.Try(Json.parse(metaStr)).toOption.getOrElse(JsNull)

    // Try flat keys like "structure.id" first, then nested "structure" -> "id"
    def lookup(jsv: JsValue, key: String): Option[String] = {
      val flat = (jsv \ key).asOpt[String]
      if (flat.isDefined) flat
      else if (key.contains(".")) {
        val parts = key.split("\\.").toList
        parts match {
          case h :: tail => tail.foldLeft(jsv \ h: JsLookupResult)((acc, k) => acc \ k).toOption.flatMap(_.asOpt[String])
          case _ => None
        }
      } else None
    }

    keys.view.flatMap(k => lookup(js, k)).map(_.trim).find(_.nonEmpty).getOrElse("")
  }

  private def deriveColFromMeta(t: Table, newName: String, keys: Seq[String]): StringColumn = {
    val meta = getMetaCol(t)
    val values = new java.util.ArrayList[String](t.rowCount())
    var i = 0
    while (i < t.rowCount()) {
      val v = pickFromJson(meta.get(i), keys)
      values.add(v)
      i += 1
    }
    StringColumn.create(newName, values)
  }

  private val withDerived: Table = {
    val t = raw.copy()
    // derive "structure.id" and "cell.subset" from JSON
    val structureIdCol = deriveColFromMeta(t, "structure.id",
      Seq("structure.id", "structureId", "structure.id", "structure.id")) // tries flat; nested is handled too
    val cellSubsetCol  = deriveColFromMeta(t, "cell.subset",
      Seq("cell.subset", "cellSubset", "cell_subset", "cell.subset"))

    t.addColumns(structureIdCol)
    t.addColumns(cellSubsetCol)
    t
  }

  // ---------- keep only rows that actually have a structure image ----------
  private val structures: Table = {
    val sid = withDerived.stringColumn("structure.id")
    // prune empty / missing / literal "null"
    val nonEmpty = sid.isNotMissing.and(sid.isNotEqualTo("")).and(sid.isNotEqualTo("null"))
    val filteredNonEmpty = withDerived.where(nonEmpty)

    val idCol = filteredNonEmpty.stringColumn("structure.id")
    val subsetColOpt = if (filteredNonEmpty.columnNames().contains("cell.subset")) Some(filteredNonEmpty.stringColumn("cell.subset")) else None
    val kept = mutable.ArrayBuffer.empty[Int]

    var idx = 0
    while (idx < filteredNonEmpty.rowCount()) {
      val rawId = Option(idCol.get(idx)).map(_.trim).getOrElse("")
      val subsetRaw = subsetColOpt.flatMap(c => Option(c.get(idx))).getOrElse("")
      if (hasStructureImage(rawId, subsetRaw)) {
        kept += idx
      }
      idx += 1
    }

    if (kept.isEmpty) {
      filteredNonEmpty.emptyCopy()
    } else {
      val selection = tech.tablesaw.selection.Selection.`with`(kept.toArray: _*)
      filteredNonEmpty.where(selection)
    }
  }

  // ---------- metadata tree built from pruned table ----------
  private val metadataLevels = Seq("species", "gene", "mhc.class", "mhc.a", "antigen.epitope")
  private val metadata: MotifsMetadata =
    MotifsMetadata.generateMetadataFromLevels(structures, metadataLevels)

  private val availableStructureIds: Set[String] =
    structures.stringColumn("structure.id").asList().asScala.map((s) => Option(s).map(_.trim.toLowerCase(Locale.ROOT)).getOrElse("")).filter(_.nonEmpty).toSet

  def getMetadata: MotifsMetadata = metadata

  def getAvailableStructureIds: Set[String] = availableStructureIds

  // ---------- filter → flat list of structures ----------
  def filter(f: MotifsSearchTreeFilter): Future[StructuresSearchTreeFilterResult] = Future {
    val selOpt = f.entries
      .map(h => structures.stringColumn(h.name).isEqualTo(h.value))
      .reduceRightOption((l, r) => l.and(r))

    val filtered = selOpt.map(structures.where).getOrElse(structures)

    val epitopeGroups = filtered.splitOn(filtered.stringColumn("antigen.epitope")).asTableList().asScala

    val epitopes: Seq[StructureEpitope] = epitopeGroups.flatMap { epitopeTable =>
      val epitopeValue = firstNonEmpty(epitopeTable, "antigen.epitope")
      epitopeValue.map { epitopeName =>
        val hashSeed = metadataLevels.flatMap(level => firstValue(epitopeTable, level)).mkString
        val hash = if (hashSeed.nonEmpty) CommonUtils.md5(hashSeed) else s"structures:$epitopeName"

        val clusters: Seq[StructureCluster] = epitopeTable
          .splitOn(epitopeTable.stringColumn("structure.id"))
          .asTableList()
          .asScala
          .flatMap(buildCluster)
          .toSeq

        if (clusters.nonEmpty) Some(StructureEpitope(epitopeName, hash, clusters)) else None
      }
    }.flatten

    StructuresSearchTreeFilterResult(epitopes)
  }

  def cdr3(cdr3: String, substring: Boolean, gene: String, top: Int): Future[StructureCDR3SearchResult] = Future {
    val query = Option(cdr3).map(_.trim).getOrElse("")
    val normalizedGene = Option(gene).map(_.trim.toUpperCase(Locale.ROOT)).getOrElse("BOTH")
    val safeTop = Math.max(1, Math.min(maxTopValueInCDR3Search, if (top <= 0) maxTopValueInCDR3Search else top))

    if (query.isEmpty) {
      StructureCDR3SearchResult(
        StructureCDR3SearchResultOptions(query, safeTop, normalizedGene, substring),
        Seq.empty,
        Seq.empty
      )
    } else {
      val base = filterByGene(structures, normalizedGene)
      if (!base.columnNames().contains("cdr3")) {
        StructureCDR3SearchResult(
          StructureCDR3SearchResultOptions(query, safeTop, normalizedGene, substring),
          Seq.empty,
          Seq.empty
        )
      } else {
        val matchesByStructure = mutable.HashMap.empty[String, Int]
        val cdr3Col = base.stringColumn("cdr3")
        val structureCol = base.stringColumn("structure.id")
        val queryUpper = query.toUpperCase(Locale.ROOT)

        var idx = 0
        while (idx < base.rowCount()) {
          val rawStructureId = Option(structureCol.get(idx)).map(_.trim).getOrElse("")
          if (rawStructureId.nonEmpty) {
            val cVal = Option(cdr3Col.get(idx)).map(_.trim).getOrElse("")
            val matchesCdr3 = if (substring) cVal.toUpperCase(Locale.ROOT).contains(queryUpper) else cVal.equalsIgnoreCase(query)
            if (matchesCdr3) {
              matchesByStructure.update(rawStructureId, matchesByStructure.getOrElse(rawStructureId, 0) + 1)
            }
          }
          idx += 1
        }

        val candidateEntries = mutable.ArrayBuffer.empty[(StructureCluster, Double, Double)]

        matchesByStructure.foreach { case (structureId, count) =>
          val table = structures.where(structures.stringColumn("structure.id").isEqualTo(structureId))
          buildCluster(table).foreach { cluster =>
            val normalizedScore = if (cluster.size <= 0) count.toDouble else count.toDouble / cluster.size
            candidateEntries += ((cluster, count.toDouble, normalizedScore))
          }
        }

        val clusters = takeDistinct(candidateEntries.sortBy(-_._2).toVector, safeTop)
          .map { case (cluster, score, _) => StructureCDR3SearchEntry(score, query, cluster) }
        val clustersNorm = takeDistinct(candidateEntries.sortBy(-_._3).toVector, safeTop)
          .map { case (cluster, _, scoreNorm) => StructureCDR3SearchEntry(scoreNorm, query, cluster) }

        StructureCDR3SearchResult(
          StructureCDR3SearchResultOptions(query, safeTop, normalizedGene, substring),
          clusters,
          clustersNorm
        )
      }
    }
  }

  private def firstValue(table: Table, column: String): Option[String] = {
    if (!table.columnNames().contains(column)) {
      None
    } else {
      table.stringColumn(column).asList().asScala.collect {
        case value if value != null && value.trim.nonEmpty => value.trim
      }.headOption
    }
  }

  private def firstNonEmpty(table: Table, column: String): Option[String] = firstValue(table, column)

  private def buildCluster(table: Table): Option[StructureCluster] = {
    val structureId = firstValue(table, "structure.id").getOrElse("")
    if (structureId.isEmpty) {
      None
    } else {
      val size = table.rowCount()
      val length = firstValue(table, "cdr3").map(_.length).getOrElse(0)
      val vsegm = firstValue(table, "v.segm").getOrElse("")
      val jsegm = firstValue(table, "j.segm").getOrElse("")
      val cellSubsetValue = firstValue(table, "cell.subset").getOrElse("")

      val trimmedId = structureId.trim
      if (!hasStructureImage(trimmedId, cellSubsetValue)) {
        return None
      }

      val meta = StructureClusterMeta(
        species = firstValue(table, "species").getOrElse(""),
        gene = firstValue(table, "gene").getOrElse(""),
        mhcclass = firstValue(table, "mhc.class").getOrElse(""),
        mhca = firstValue(table, "mhc.a").getOrElse(""),
        mhcb = firstValue(table, "mhc.b").getOrElse(""),
        antigenGene = firstValue(table, "antigen.gene").getOrElse(""),
        antigenSpecies = firstValue(table, "antigen.species").getOrElse(""),
        cellSubset = cellSubsetValue
      )

      Some(StructureCluster(trimmedId, size, length, vsegm, jsegm, Seq.empty, meta))
    }
  }

  private def hasStructureImage(structureId: String, subsetRaw: String): Boolean = {
    val trimmedId = Option(structureId).map(_.trim).getOrElse("")
    if (trimmedId.isEmpty) {
      false
    } else {
      val dir = if (Option(subsetRaw).getOrElse("").toUpperCase(Locale.ROOT).contains("CD4")) "cd4" else "cd8"
      val imagePath = structureImagesDir.resolve(Paths.get(dir, s"$trimmedId.png")).normalize()
      Files.isRegularFile(imagePath) && imagePath.startsWith(structureImagesDir)
    }
  }

  private def filterByGene(table: Table, gene: String): Table = {
    gene match {
      case "TRA" | "TRB" =>
        if (table.columnNames().contains("gene")) {
          table.where(table.stringColumn("gene").isEqualTo(gene))
        } else {
          table
        }
      case _ => table
    }
  }

  private def takeDistinct(entries: Vector[(StructureCluster, Double, Double)], limit: Int): Seq[(StructureCluster, Double, Double)] = {
    if (limit <= 0) {
      Seq.empty
    } else {
      val seen = mutable.HashSet.empty[String]
      val buffer = mutable.ArrayBuffer.empty[(StructureCluster, Double, Double)]
      var idx = 0
      val upper = if (limit > entries.length) entries.length else limit
      while (idx < entries.length && buffer.length < upper) {
        val entry = entries(idx)
        val id = entry._1.clusterId
        if (!seen.contains(id)) {
          seen += id
          buffer += entry
        }
        idx += 1
      }
      buffer
    }
  }
}

object Structures {
  private def hasImageSubdirectories(dir: Path): Boolean =
    Files.isDirectory(dir) && (Files.isDirectory(dir.resolve("cd4")) || Files.isDirectory(dir.resolve("cd8")))

  def resolveImageRoot(database: Database): Path = {
    val base = Paths.get(database.getLocation).toAbsolutePath.normalize()
    val candidates = Seq(
      base.resolve("structure"),
      base.resolve("structures"),
      base,
      base.resolve("test").resolve("merged").resolve("structure")
    ).map(_.normalize()).distinct

    candidates.find(hasImageSubdirectories).getOrElse(base.resolve("structure").normalize())
  }
}
