# This file defines the AWS VPC resource for the production environment.

resource "aws_vpc" "prod-vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name        = "Prod VPC"
    Environment = "production"
  }
}

#public subnet 1
resource "aws_subnet" "prod-public-subnet-1" {
  vpc_id                  = aws_vpc.prod-vpc.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = true
  tags = {
    Name        = "Prod Public Subnet"
    Environment = "production"
  }
}

#public subnet 2

resource "aws_subnet" "prod-public-subnet-2" {
  vpc_id                  = aws_vpc.prod-vpc.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "us-east-1b"
  map_public_ip_on_launch = true
  tags = {
    Name        = "Prod Public Subnet 2"
    Environment = "production"
  }
}

#private subnet 1
resource "aws_subnet" "prod-private-subnet-1" {
  vpc_id            = aws_vpc.prod-vpc.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "us-east-1a"
  tags = {
    Name        = "Prod Private Subnet 1"
    Environment = "production"
  }
}

#private subnet 2
resource "aws_subnet" "prod-private-subnet-2" {
  vpc_id            = aws_vpc.prod-vpc.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "us-east-1b"
  tags = {
    Name        = "Prod Private Subnet 2"
    Environment = "production"
  }
}

#DB subnet private 1

resource "aws_subnet" "prod-db-private-subnet-1" {
  vpc_id            = aws_vpc.prod-vpc.id
  cidr_block        = "10.0.21.0/24"
  availability_zone = "us-east-1a"
  tags = {
    Name        = "Prod DB Subnet 1"
    Environment = "production"
  }
}

#DB subnet private 2

resource "aws_subnet" "prod-db-private-subnet-2" {
  vpc_id            = aws_vpc.prod-vpc.id
  cidr_block        = "10.0.22.0/24"
  availability_zone = "us-east-1b"
  tags = {
    Name        = "Prod DB Subnet 2"
    Environment = "production"
  }
}

#internet gatway

resource "aws_internet_gateway" "prod-igw" {
  vpc_id = aws_vpc.prod-vpc.id

  tags = {
    Name        = "Prod Internet Gateway"
    Environment = "production"
  }
}

#nat gateway

resource "aws_eip" "prod-nat-eip" {
  domain = "vpc"

  depends_on = [aws_internet_gateway.prod-igw]
}

resource "aws_nat_gateway" "prod-nat-gateway" {
  allocation_id = aws_eip.prod-nat-eip.id
  subnet_id     = aws_subnet.prod-public-subnet-1.id

  tags = {
    Name        = "Prod NAT Gateway"
    Environment = "production"
  }
}

#route table for public subnets

resource "aws_route_table" "prod-public-rt" {
  vpc_id = aws_vpc.prod-vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.prod-igw.id
  }

  tags = {
    Name        = "Prod Public Route Table"
    Environment = "production"
  }

}
#route table associtioan for public subnets
resource "aws_route_table_association" "prod-public-subnet-1-association" {
  subnet_id      = aws_subnet.prod-public-subnet-1.id
  route_table_id = aws_route_table.prod-public-rt.id
}

resource "aws_route_table_association" "prod-public-subnet-2-association" {
  subnet_id      = aws_subnet.prod-public-subnet-2.id
  route_table_id = aws_route_table.prod-public-rt.id
}


#----------------------------------------------------------------------------------------------

#route table for private subnets

resource "aws_route_table" "prod-private-rt" {
  vpc_id = aws_vpc.prod-vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.prod-nat-gateway.id
  }

  tags = {
    Name        = "Prod Private Route Table"
    Environment = "production"
  }
}

resource "aws_route_table_association" "prod-private-subnet-1-association" {
  subnet_id      = aws_subnet.prod-private-subnet-1.id
  route_table_id = aws_route_table.prod-private-rt.id
}

resource "aws_route_table_association" "prod-private-subnet-2-association" {
  subnet_id      = aws_subnet.prod-private-subnet-2.id
  route_table_id = aws_route_table.prod-private-rt.id
}
