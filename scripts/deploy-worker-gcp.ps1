# Automated Deployment Script for BuyerWatch Background Worker on GCP Cloud Run
Param(
    [string]$ProjectId = "scouto-501307",
    [string]$Region = "us-central1",
    [string]$ServiceName = "buyerwatch-worker",
    [ValidateRange(1, 10)]
    [int]$MinInstances = 1,
    [ValidateRange(1, 20)]
    [int]$MaxInstances = 2
)

if ($MaxInstances -lt $MinInstances) {
    throw "MaxInstances must be greater than or equal to MinInstances."
}

Write-Host "🚀 Deploying BuyerWatch Background Worker to GCP ($ProjectId / $Region)..." -ForegroundColor Cyan

# Cloud Run requires an active billing account. Fail before enabling APIs or
# submitting a build so a closed account cannot leave a partial deployment.
$BillingEnabled = gcloud billing projects describe $ProjectId `
    --format "value(billingEnabled)" 2>$null
if ($LASTEXITCODE -ne 0 -or $BillingEnabled -ne "True") {
    throw "Google Cloud billing is not enabled for $ProjectId. Link an active billing account before deploying."
}

# 1. Enable required GCP Services
Write-Host "1. Enabling Google Cloud Run & Container Registry APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com containerregistry.googleapis.com artifactregistry.googleapis.com --project $ProjectId

# 2. Build and Submit Container Image to Google Container Registry
$ImageUri = "gcr.io/$ProjectId/$ServiceName`:latest"
Write-Host "2. Building & Pushing Docker Container to $ImageUri..." -ForegroundColor Yellow
gcloud builds submit --tag $ImageUri --project $ProjectId

# 3. Deploy Container to Cloud Run with CPU available for background work.
Write-Host "3. Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $ImageUri `
    --platform managed `
    --region $Region `
    --project $ProjectId `
    --min-instances $MinInstances `
    --max-instances $MaxInstances `
    --no-cpu-throttling `
    --cpu 1 `
    --memory 1Gi `
    --port 3001 `
    --startup-probe "httpGet.path=/healthz,httpGet.port=3001,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=5,failureThreshold=12" `
    --readiness-probe "httpGet.path=/readyz,httpGet.port=3001,initialDelaySeconds=5,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" `
    --liveness-probe "httpGet.path=/healthz,httpGet.port=3001,initialDelaySeconds=30,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" `
    --allow-unauthenticated `
    --update-env-vars "NODE_ENV=production,GCP_PROJECT=$ProjectId,GCP_LOCATION=$Region"

if ($LASTEXITCODE -ne 0) {
    throw "Cloud Run deployment failed."
}

$ServiceUrl = gcloud run services describe $ServiceName `
    --region $Region `
    --project $ProjectId `
    --format "value(status.url)"

if (-not $ServiceUrl) {
    throw "Cloud Run did not return a service URL."
}

Write-Host "4. Verifying worker readiness at $ServiceUrl/readyz..." -ForegroundColor Yellow
$Ready = $false
for ($Attempt = 1; $Attempt -le 12; $Attempt++) {
    try {
        $Response = Invoke-WebRequest -Uri "$ServiceUrl/readyz" -UseBasicParsing -TimeoutSec 10
        if ($Response.StatusCode -eq 200) {
            $Ready = $true
            break
        }
    } catch {
        if ($Attempt -eq 12) { break }
    }
    Start-Sleep -Seconds 5
}

if (-not $Ready) {
    throw "Worker deployed but never became ready. Inspect the latest Cloud Run revision logs."
}

Write-Host "Deployment complete. The always-allocated worker passed its readiness check." -ForegroundColor Green
