package backend.controllers

import javax.inject._
import play.api.mvc._
import java.nio.file.{Files, Paths, Path}
import backend.server.database.Database
import scala.concurrent._
import ExecutionContext.Implicits.global

@Singleton
class ImageController @Inject()(cc: ControllerComponents, db: Database)
  extends AbstractController(cc) {

  private val baseDir: Path =
    Paths.get(db.getLocation, "structure").toAbsolutePath.normalize()

  def structure(path: String): Action[AnyContent] = Action {
    val requested = baseDir.resolve(path).normalize()
    if (!requested.startsWith(baseDir) || !Files.isRegularFile(requested)) NotFound("Image not found")
    else Ok.sendPath(requested, inline = true)
  }
}