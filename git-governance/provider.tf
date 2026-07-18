terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "github" {
  owner = "Dhiman23"
}

data "github_repository" "openkubescope" {
  name = "openkubeScope"
}
