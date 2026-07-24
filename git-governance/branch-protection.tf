
resource "github_repository_ruleset" "openkubescope_main_ruleset" {
  name        = var.github_repository_ruleset
  repository  = data.github_repository.openkubescope.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/${var.branch_name}"]
      exclude = []

    }
  }


  rules {
    creation                = false

    update                  = true
    deletion                = false
    required_linear_history = true
    required_signatures     = false


    pull_request {
    required_approving_review_count = 0
    dismiss_stale_reviews_on_push   = true
    require_code_owner_review       = false
    require_last_push_approval      = false
    required_review_thread_resolution = true

    allowed_merge_methods = [
      "merge",
      "squash",
      "rebase"
    ]
  }

    required_code_scanning {
      required_code_scanning_tool {
        alerts_threshold          = "errors"
        security_alerts_threshold = "high_or_higher"
        tool                      = var.required_code_scanning_tool
      }
    }
  }
}
#this is imp sajal
#this is imp
