# Automated Deployment Script for BuyerWatch Background Worker on GCP Cloud Run
Param(
    [string]$ProjectId = "scouto-501307",
    [string]$Region = "us-central1",
    [string]$ServiceName = "buyerwatch-worker"
)

Write-Host "🚀 Deploying BuyerWatch Background Worker to GCP ($ProjectId / $Region)..." -ForegroundColor Cyan

# 1. Enable required GCP Services
Write-Host "1. Enabling Google Cloud Run & Container Registry APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com containerregistry.googleapis.com artifactregistry.googleapis.com --project $ProjectId

# 2. Build and Submit Container Image to Google Container Registry
$ImageUri = "gcr.io/$ProjectId/$ServiceName`:latest"
Write-Host "2. Building & Pushing Docker Container to $ImageUri..." -ForegroundColor Yellow
gcloud builds submit --tag $ImageUri --project $ProjectId

# 3. Deploy Container to Cloud Run as a 24/7 Service
Write-Host "3. Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $ImageUri `
    --platform managed `
    --region $Region `
    --project $ProjectId `
    --min-instances 1 `
    --max-instances 2 `
    --allow-unauthenticated `
    --set-env-vars "NODE_ENV=production,GCP_PROJECT=$ProjectId,GCP_LOCATION=$Region"

Write-Host "✅ Deployment Complete! Your background worker is running 24/7 on GCP." -ForegroundColor Green
