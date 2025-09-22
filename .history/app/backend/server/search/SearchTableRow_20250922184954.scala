/*
 *     Copyright 2017-2019 Bagaev Dmitry
 *
 *     Licensed under the Apache License, Version 2.0 (the "License");
 *     you may not use this file except in compliance with the License.
 *     You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *     Unless required by applicable law or agreed to in writing, software
 *     distributed under the License is distributed on an "AS IS" BASIS,
 *     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *     See the License for the specific language governing permissions and
 *     limitations under the License.
 */

package backend.server.search

import com.antigenomics.vdjdb.db.Row
import play.api.libs.json.{Format, JsObject, Json}

import scala.collection.JavaConverters._
import scala.collection.mutable.ArrayBuffer
import scala.util.Try

case class SearchTableRow(entries: Seq[String], metadata: SearchTableRowMetadata)

object SearchTableRow {
  implicit val searchTableRowFormat: Format[SearchTableRow] = Json.format[SearchTableRow]

  def createFromRow(r: Row): SearchTableRow = {
    val visibleEntries = r.getEntries.asScala.filter(_.getColumn.getMetadata.get("visible") == "1")
    val entryValues = ArrayBuffer.empty[String]
    val hasContactsColumn = visibleEntries.exists(_.getColumn.getName == "contacts")

    visibleEntries.foreach(e => entryValues += e.getValue)

    if (!hasContactsColumn) {
      entryValues += deriveContactsValue(r)
    }

    val metadata = SearchTableRowMetadata.createFromRow(r)
    SearchTableRow(entryValues.toSeq, metadata)
  }

  private def deriveContactsValue(row: Row): String = {
    val metaValue = Option(row.getAt("meta")).map(_.getValue)
    val structureId = metaValue.flatMap { metaString =>
      Try(Json.parse(metaString)).toOption.flatMap {
        case obj: JsObject =>
          obj.value.get("structure.id").flatMap(_.asOpt[String]).map(_.trim).filter(_.nonEmpty)
        case _ => None
      }
    }.getOrElse("")

    if (structureId.nonEmpty) {
      s"/structure?structure_id=$structureId"
    } else {
      ""
    }
  }
}
