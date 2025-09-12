package backend.controllers

import akka.actor.ActorSystem
import akka.stream.Materializer
import backend.server.limit.RequestLimits
import backend.server.structures.{Structures, StructureList}
import backend.server.motifs.api.filter.MotifsSearchTreeFilter
import javax.inject._
import play.api.libs.json._
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

@Singleton
class StructuresAPI @Inject()(
                               cc: ControllerComponents,
                               structures: Structures
                             )(implicit as: ActorSystem, mat: Materializer, ec: ExecutionContext, limits: RequestLimits)
  extends AbstractController(cc) {

  // metadata: unchanged (same tree shape as Motifs)
  def getMetadata: Action[AnyContent] = Action.async {
    Future.successful(Ok(Json.obj("root" -> structures.getMetadata.root)))
  }

  // filter: returns a flat list { total, items: [{ id, cd, meta, imageUrl }] }
  def filter: Action[JsValue] = Action.async(parse.json) { implicit req =>
    req.body.validate[MotifsSearchTreeFilter].fold(
      e => Future.successful(BadRequest(JsError.toJson(e))),
      f => structures.filter(f).map { list: StructureList =>
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
}
