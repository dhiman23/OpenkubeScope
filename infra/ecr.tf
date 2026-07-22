resource "aws_ecr_repository" "my_repo" {

  name = openkubescope

  image_tag_mutability = "MUTABLE"
 
  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "openkubescope-ecr"
    Environment = "prod"
  }
}