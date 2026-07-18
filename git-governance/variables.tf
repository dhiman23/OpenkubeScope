variable "github_repository_ruleset" {
    description = "rule set name "
    type = string

}

variable "branch_name" {
  type        = string
  description = "Branch to protect"
}

variable "required_code_scanning_tool" {

    type = string
    description = "input the tool your want to add"

}
