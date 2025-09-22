package backend.controllers

import akka.actor.ActorSystem
import akka.stream.Materializer
import backend.server.motifs.Motifs
import backend.server.structures.Structures
import javax.inject._
import play.api.libs.json.{Json, OFormat}
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

case class SearchAvailabilityResponse(structures: Seq[String], motifs: Seq[String])

object SearchAvailabilityResponse {
  implicit val format: OFormat[SearchAvailabilityResponse] = Json.format[SearchAvailabilityResponse]
}

@Singleton
class SearchAvailabilityAPI @Inject()(cc: ControllerComponents,
                                      structures: Structures,
                                      motifs: Motifs)
                                     (implicit as: ActorSystem, mat: Materializer, ec: ExecutionContext)
  extends AbstractController(cc) {

  def availability: Action[AnyContent] = Action.async {
    val structuresSet = structures.getAvailableStructureIds.toSeq
    val motifKeys = motifs.getAvailabilityKeys.toSeq
    Future.successful(Ok(Json.toJson(SearchAvailabilityResponse(structuresSet, motifKeys))))
  }
}
