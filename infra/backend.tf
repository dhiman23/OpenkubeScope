terraform {
  backend "s3" {

    bucket       = "kubescope-bucket"
    key          = "kubescope-bucket/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true

  }
}