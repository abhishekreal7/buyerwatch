#!/usr/bin/env bash
set -e

PROJECT_ID="scouto-501307"
REGION="us-central1"
SERVICE_NAME="scouto-worker"

echo "🚀 Deploying Scouto Background Worker to GCP ($PROJECT_ID / $REGION)..."

# 1. Enable GCP Services
gcloud services enable run.googleapis.com containerregistry.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

# 2. Build & Submit Container
IMAGE_URI="gcr.io/$PROJECT_ID/$SERVICE_NAME:latest"
echo "2. Building & Pushing Docker Container to $IMAGE_URI..."
gcloud builds submit --tag "$IMAGE_URI" --project "$PROJECT_ID"

# 3. Deploy to Cloud Run
echo "3. Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --min-instances 1 \
  --max-instances 2 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,GCP_PROJECT=$PROJECT_ID,GCP_LOCATION=$REGION"

echo "✅ Deployment Complete! Your background worker is running 24/7 on GCP."
