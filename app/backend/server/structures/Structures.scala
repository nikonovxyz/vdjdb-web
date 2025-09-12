package backend.server.structures

import javax.inject.{Inject, Singleton}
import backend.server.database.Database
import backend.server.structures.{Structures, StructuresMetadata}
import backend.server.structures.Structures
import backend.server.structures.api.cdr3.{StructureCDR3SearchEntry, StructureCDR3SearchResult, StructureCDR3SearchResultOptions}
import backend.server.structures.api.epitope.StructureCluster
import backend.server.structures.api.cdr3.StructureCDR3SearchResult
import backend.server.structures.StructuresMetadata
import backend.server.structures.api.filter.StructuresSearchTreeFilter
import play.api.libs.json._
import tech.tablesaw.api.{ColumnType, StringColumn, Table}
import tech.tablesaw.io.csv.CsvReadOptions

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Success

case class StructureItem(id: String, cd: Int, meta: Map[String, String])
case class StructureList(total: Long, items: Seq[StructureItem])

@Singleton
case class Structures @Inject()(database: Database)(implicit ec: ExecutionContext) {
  private final val members = Structures.parseClusterMembersFileIntoDataFrame(database.getClusterMembersFile.map(_.getPath))
  private final val cdr3Range = Structures.parseCDR3LengthRange(table)

  private final val metadataLevels = Seq("species", "gene", "mhc.class", "mhc.a", "antigen.epitope")
  private final val metadata = StructuresMetadata.generateMetadataFromLevels(table, metadataLevels)

  // ---------- load vdjdb.txt ----------
  private def loadVdjdb(): Table = {
    val path = database.getLocation + "/vdjdb.txt"
    val opts = CsvReadOptions.builder(path).separator('\t').header(true).build() // TSV with header
    Table.read().csv(opts)  // tech.tablesaw read using options
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
    withDerived.where(nonEmpty)
  }

  // ---------- metadata tree built from pruned table ----------
  private val metadataLevels = Seq("species", "gene", "mhc.class", "mhc.a", "antigen.epitope")
  private val metadata: StructuresMetadata =
    StructuresMetadata.generateMetadataFromLevels(structures, metadataLevels)

  def getMetadata: StructuresMetadata = metadata

  // ---------- filter → flat list of structures ----------
  def filterFlat(f: StructuresSearchTreeFilter): Future[StructureList] = Future {
    val selOpt = f.entries
      .map(h => structures.stringColumn(h.name).isEqualTo(h.value))
      .reduceRightOption((l, r) => l.and(r))

    val filtered = selOpt.map(structures.where).getOrElse(structures)

    val groups = filtered.splitOn(filtered.stringColumn("structure.id")).asTableList().asScala

    val items: Seq[StructureItem] = groups.map { g =>
      val sid = g.stringColumn("structure.id").asSet().asScala.headOption.getOrElse("").trim
      val species = g.stringColumn("species").asSet().asScala.headOption.getOrElse("")
      val gene = g.stringColumn("gene").asSet().asScala.headOption.getOrElse("")
      val mhcCls = g.stringColumn("mhc.class").asSet().asScala.headOption.getOrElse("")
      val mhcA = g.stringColumn("mhc.a").asSet().asScala.headOption.getOrElse("")
      val mhcB = if (g.columnNames().contains("mhc.b")) g.stringColumn("mhc.b").asSet().asScala.headOption.getOrElse("") else ""
      val epitope = g.stringColumn("antigen.epitope").asSet().asScala.headOption.getOrElse("")
      val subset = if (g.columnNames().contains("cell.subset")) g.stringColumn("cell.subset").asSet().asScala.headOption.getOrElse("") else ""

      val cd = if (subset.toUpperCase.contains("CD4")) 4 else 8

      StructureItem(
        id = sid,
        cd = cd,
        meta = Map(
          "structure.id" -> sid,
          "species" -> species,
          "gene" -> gene,
          "mhc.class" -> mhcCls,
          "mhc.a" -> mhcA,
          "mhc.b" -> mhcB,
          "antigen.epitope" -> epitope,
          "cell.subset" -> subset
        )
      )
    }

    StructureList(total = items.length.toLong, items = items)
  }

  def cdr3(cdr3: String, substring: Boolean, gene: String, top: Int): Future[StructureCDR3SearchResult] = {
    val results = if (substring) {
      substring_cdr3(cdr3, gene, top)
    } else {
      whole_cdr3(cdr3, gene, top)
    }

    results.map { r =>
      StructureCDR3SearchResult(r.options, r.clusters.filter(_.info > 0.0), r.clustersNorm.filter(_.info > 0.0))
    }
  }

  private def whole_cdr3(cdr3: String, gene: String, top: Int): Future[StructureCDR3SearchResult] = Future.successful {
    val filterRules = table.intColumn("len").isEqualTo(cdr3.length.toDouble)
      .and(
        if (gene != "TRA" && gene != "TRB")
          table.stringColumn("gene").isIn("TRA", "TRB")
        else
          table.stringColumn("gene").isEqualTo(gene)
      )

    val mapped = table.where(filterRules).splitOn(table.stringColumn("cid")).asTableList().asScala.map { t =>
      val info: Seq[(Double, Double)] = t.splitOn("pos").asTableList().asScala.map { p =>
        val posSet = p.intColumn("pos").asScala.toSet
        assert(posSet.size == 1)

        val pos = posSet.head
        val index = p.stringColumn("aa").firstIndexOf(String.valueOf(cdr3(pos)))

        val i: (Double, Double) = if (index != -1) {
          val I = p.doubleColumn("height.I").get(index)
          val Inorm = p.doubleColumn("height.I.norm").get(index)

          (I, Inorm)
        } else {
          (0.0d, 0.0d)
        }
        i
      }
      val reduced = info.reduce((l, r) => (l._1 + r._1, l._2 + r._2))
      (reduced._1, reduced._2, StructureCluster.fromTable(t))
    }

    val safeTop = Math.max(1, Math.min(Structures.maxTopValueInCDR3Search, top))
    val clusters = mapped.sortWith(_._1 > _._1).take(safeTop).map { case (i, _, cluster) => StructureCDR3SearchEntry(i, cdr3, cluster) }
    val clustersNorm = mapped.sortWith(_._2 > _._2).take(safeTop).map { case (_, in, cluster) => StructureCDR3SearchEntry(in, cdr3, cluster) }

    StructureCDR3SearchResult(StructureCDR3SearchResultOptions(cdr3, safeTop, gene, substring = false), clusters, clustersNorm)
  }

  private def substring_cdr3(cdr3: String, gene: String, top: Int): Future[StructureCDR3SearchResult] = {
    if (cdr3.length < Structures.minSubstringCDR3Length) {
      Future.failed(new IllegalArgumentException("Illegal CDR3 length"))
    } else if (cdr3.length > cdr3Range._2) {
      Future.successful(StructureCDR3SearchResult(StructureCDR3SearchResultOptions(cdr3, top, gene, substring = true), Seq(), Seq()))
    } else {
      val safeTop = Math.max(1, Math.min(Structures.maxTopValueInCDR3Search, top))

      val fakeCDR3s = (Math.max(cdr3.length, cdr3Range._1) to cdr3Range._2 + 1).flatMap(length => {
        (0 to (length - cdr3.length)).map(f => ("X" * f) + cdr3 + ("X" * (length - cdr3.length - f)))
      })

      val futureResults = Future.sequence(fakeCDR3s.map(fake => whole_cdr3(fake, gene, safeTop)).map(_.transform(Success(_)))).map(_.collect { case Success(x) => x })
      val topEntries = futureResults.map(_.map(s => (s.clusters, s.clustersNorm)).reduce((l, r) => (l._1 ++ r._1, l._2 ++ r._2))).map(d => {
        (d._1.distinct.sortWith(_.info > _.info).take(safeTop), d._2.distinct.sortWith(_.info > _.info).take(safeTop))
      })

      topEntries.map(e => StructureCDR3SearchResult(StructureCDR3SearchResultOptions(cdr3, safeTop, gene, substring = true), e._1, e._2))
    }
  }
}

object Structures {
  private final val maxTopValueInCDR3Search: Int = 15
  private final val minSubstringCDR3Length: Int = 3

  def parseStructureFileIntoDataFrame(path: Option[String]): Table = {
    path match {
      case Some(p) =>
        // TODO metadata file
        val columnTypes: Array[ColumnType] = Array(
          ColumnType.STRING, // species
          ColumnType.STRING, // antigen.epitope
          ColumnType.STRING, // gene
          ColumnType.STRING, // aa
          ColumnType.INTEGER, // pos
          ColumnType.INTEGER, // len
          ColumnType.STRING, // v.segm.repr
          ColumnType.STRING, // j.segm.repr
          ColumnType.STRING, // cid
          ColumnType.INTEGER, // csz
          ColumnType.INTEGER, // count
          ColumnType.SKIP, // count.bg
          ColumnType.SKIP, // total.bg
          ColumnType.SKIP, // count.bg.i
          ColumnType.SKIP, // total.bg.i
          ColumnType.SKIP, // need.impute
          ColumnType.DOUBLE, // freq
          ColumnType.SKIP, // freq.bg
          ColumnType.DOUBLE, // I
          ColumnType.DOUBLE, // I.norm
          ColumnType.DOUBLE, // height.I
          ColumnType.DOUBLE, // height.I.norm
          ColumnType.STRING, // antigen.gene
          ColumnType.STRING, // antigen.species
          ColumnType.STRING, // mhc.a
          ColumnType.STRING, // mhc.b
          ColumnType.STRING, // mhc.class
        )
        val builder = CsvReadOptions.builder(p)
          .separator('\t')
          .header(true)
          .columnTypes(columnTypes)
        val options = builder.build()
        val table = Table.read().csv(options)

        table.replaceColumn("mhc.a", table.stringColumn("mhc.a").replaceAll(":.+", "").setName("mhc.a"))
        table.replaceColumn("mhc.b", table.stringColumn("mhc.b").replaceAll(":.+", "").setName("mhc.b"))

      case None => Table.create("")
    }
  }

  def parseClusterMembersFileIntoDataFrame(path: Option[String]): Table = {
    path match {
      case Some(p) =>
        val columnTypes: Array[ColumnType] = Array(
          ColumnType.STRING, // species
          ColumnType.STRING, // antigen.epitope
          ColumnType.STRING, // antigen.gene
          ColumnType.STRING, // antigen.species
          ColumnType.STRING, // mhc.a
          ColumnType.STRING, // mhc.b
          ColumnType.STRING, // mhc.class
          ColumnType.STRING, // gene
          ColumnType.STRING, // cdr3aa
          ColumnType.SKIP, // x
          ColumnType.SKIP, // y
          ColumnType.STRING, // cid
          ColumnType.STRING, // csz
          ColumnType.STRING, // v.segm
          ColumnType.STRING, // j.segm
          ColumnType.STRING, // v.end
          ColumnType.STRING, // j.start
          ColumnType.STRING, // v.segm.repr
          ColumnType.STRING, // j.segm.repr
        )
        val builder = CsvReadOptions.builder(p)
          .separator('\t')
          .header(true)
          .columnTypes(columnTypes)
        val options = builder.build()
        Table.read().csv(options)
      case None => Table.create("")
    }
  }

  def parseCDR3LengthRange(table: Table): (Int, Int) = {
    val lengths = table.intColumn("len").asScala.toSet
    (lengths.min, lengths.max)
  }
}

