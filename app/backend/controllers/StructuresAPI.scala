package backend.controllers

import akka.actor.ActorSystem
import akka.stream.Materializer
import backend.server.limit.RequestLimits
import backend.server.structures.Structures
import backend.server.structures.api.export.{ClusterMembersExportRequest, ClusterMembersExportResponse}
import backend.server.structures.api.cdr3.StructureCDR3SearchRequest
import backend.server.structures.{StructureList, Structures}
import backend.server.structures.api.filter.StructuresSearchTreeFilter
import javax.inject._
import play.api.Configuration
import play.api.libs.json.JsError
import play.api.libs.json.Json.toJson
import play.api.libs.json._
import play.api.mvc._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

@Singleton
class StructuresAPI @Inject()(
                               cc: ControllerComponents,
                               structures: Structures
                             )(implicit as: ActorSystem, mat: Materializer, ec: ExecutionContext, limits: RequestLimits)
  extends AbstractController(cc) {

  def getMetadata: Action[AnyContent] = Action.async {
    Future.successful(Ok(Json.obj("root" -> structures.getMetadata.root)))
  }

  def filter: Action[JsValue] = Action.async(parse.json) { implicit req =>
    req.body.validate[StructuresSearchTreeFilter].fold(
      e => Future.successful(BadRequest(JsError.toJson(e))),
      f => structures.filterFlat(f).map { list: StructureList =>
        val itemsWithUrl = list.items.map { it =>
          Json.obj(
            "id" -> it.id,
            "cd" -> it.cd,
            "meta" -> it.meta,
            "imageUrl" -> routes.ImageController.structure(s"cd${it.cd}/${it.id}.png").url
          )
        }
        Ok(Json.obj("total" -> list.total, "items" -> itemsWithUrl))
      }.recover { case t => InternalServerError("An error occurred: " + t.getMessage) }
    )
  }

  def cdr3: Action[AnyContent] = Action.async { implicit request =>
    request.body.asJson.map { json =>
      json.validate[StructureCDR3SearchRequest].map {
        search => structures.cdr3(search.cdr3, search.substring, search.gene, search.top).map { r => Ok(toJson(r)) }.recover { case _ => BadRequest("Bad request") }
      }.recoverTotal {
        e => Future.successful(BadRequest("Detected error:" + JsError.toFlatForm(e)))
      }
    }.getOrElse {
      Future.successful(BadRequest("Expecting Json data"))
    }
  }

  def members: Action[AnyContent] = Action.async { implicit request =>
    request.body.asJson.map { json =>
      json.validate[ClusterMembersExportRequest].map {
        export =>
          structures.members(export.cid, export.format).map(_.map(link =>
            Ok(toJson(ClusterMembersExportResponse(link.getDownloadLink))))
          ).getOrElse(Future.successful(BadRequest("Invalid format provided")))
      }.recoverTotal {
        e => Future.successful(BadRequest("Detected error:" + JsError.toFlatForm(e)))
      }
    }.getOrElse {
      Future.successful(BadRequest("Expecting Json data"))
    }
  }
}
