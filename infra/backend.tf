terraform {
    required_version = "~> 1.13.1"
    backend "s3" {
    
        bucket = "kubescope-bucket"
        key    = "kubescope-bucket/terraform.tfstate"
        region = "us-east-1"
        use_lockfile = true
        encrypt = true
        
    }
}