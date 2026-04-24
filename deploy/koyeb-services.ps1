param(
  [string]$AppName = "workflow-automation",
  [string]$Repo = "github.com/your-org/your-repo",
  [string]$Branch = "main",
  [string]$ApiService = "workflow-api",
  [string]$WorkerService = "workflow-worker"
)

Write-Host "Creating or updating Koyeb services for $AppName"

koyeb app create $AppName 2>$null

$sharedEnv = @(
  "SUPABASE_URL=`"$env:SUPABASE_URL`"",
  "SUPABASE_SERVICE_ROLE_KEY=`"$env:SUPABASE_SERVICE_ROLE_KEY`"",
  "SUPABASE_DB_URL=`"$env:SUPABASE_DB_URL`"",
  "REDIS_URL=`"$env:REDIS_URL`"",
  "SLACK_BOT_TOKEN=`"$env:SLACK_BOT_TOKEN`"",
  "GITHUB_TOKEN=`"$env:GITHUB_TOKEN`""
)

$apiEnv = $sharedEnv + @(
  "PORT=3001",
  "FRONTEND_ORIGIN=`"$env:FRONTEND_ORIGIN`""
)

koyeb service create $ApiService `
  --app $AppName `
  --git $Repo `
  --git-branch $Branch `
  --git-workdir apps/backend `
  --git-builder docker `
  --git-docker-dockerfile Dockerfile `
  --port 3001:http `
  --route /:3001 `
  --env $apiEnv

koyeb service create $WorkerService `
  --app $AppName `
  --type worker `
  --git $Repo `
  --git-branch $Branch `
  --git-workdir apps/backend `
  --git-builder docker `
  --git-docker-dockerfile Dockerfile `
  --git-docker-command "node src/worker.js" `
  --env $sharedEnv
