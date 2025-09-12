package backend.server.structures

import javax.inject.{Inject, Singleton}
import backend.server.database.Database
import backend.server.motifs.MotifsMetadata
import backend.server.motifs.api.filter.MotifsSearchTreeFilter
import play.api.libs.json._
import tech.tablesaw.api.{StringColumn, Table}
import tech.tablesaw.io.csv.CsvReadOptions

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

case class StructureItem(id: String, cd: Int, meta: Map[String, String])
case class StructureList(total: Long, items: Seq[StructureItem])

@Singleton
case class Structures @Inject()(database: Database)(implicit ec: ExecutionContext) {

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
  private val metadata: MotifsMetadata =
    MotifsMetadata.generateMetadataFromLevels(structures, metadataLevels)

  def getMetadata: MotifsMetadata = metadata

  // ---------- filter → flat list of structures ----------
  def filter(f: MotifsSearchTreeFilter): Future[StructureList] = Future {
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
}
