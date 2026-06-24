resource "aws_s3_bucket" "kubescope_bucket" {
  bucket = "kubescope-bucket"
  tags = {
    Name        = "Kubescope Bucket"
    Environment = "production"
  } 
  
}

resource "aws_s3_bucket_versioning" "kubescope_bucket_versioning" {
  bucket = aws_s3_bucket.kubescope_bucket.id
  depends_on = [aws_s3_bucket.kubescope_bucket]
  versioning_configuration {
    status = "Enabled"
  }
}

terraform {
    backend "s3" {
    
        bucket = "kubescope-bucket"
        key    = "kubescope-bucket/terraform.tfstate"
        region = "us-east-1"
        use_lockfile = true
        encrypt = true
        
    }
}