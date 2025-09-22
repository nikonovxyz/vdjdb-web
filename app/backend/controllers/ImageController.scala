package backend.controllers

import javax.inject._
import play.api.mvc._
import java.nio.file.{Files, Path}
import backend.server.database.Database
import backend.server.structures.Structures
import scala.concurrent._
import ExecutionContext.Implicits.global

@Singleton
class ImageController @Inject()(cc: ControllerComponents, db: Database)
  extends AbstractController(cc) {

  private val baseDir: Path = Structures.resolveImageRoot(db)

  def structure(path: String): Action[AnyContent] = Action {
    val requested = baseDir.resolve(path).normalize()
    if (!requested.startsWith(baseDir) || !Files.isRegularFile(requested)) NotFound("Image not found")
    else Ok.sendPath(requested, inline = true)
  }
}
