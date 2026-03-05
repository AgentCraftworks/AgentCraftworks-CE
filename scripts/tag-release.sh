#!/bin/bash

# Release Tagging Script
# Creates a Git tag with release notes for AgentCraftworks Community Edition

set -e

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo ""
    echo "Examples:"
    echo "  $0 v0.1.0"
    echo "  $0 v1.0.0"
    exit 1
fi

echo "Creating release tag: $VERSION"
echo ""

# Check if tag already exists
if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "Error: Tag $VERSION already exists"
    echo "To delete and recreate: git tag -d $VERSION && git push origin :refs/tags/$VERSION"
    exit 1
fi

# Create annotated tag with release notes
git tag -a "$VERSION" -m "AgentCraftworks Community Edition $VERSION

Key Features:
- Webhook-driven Express server (GitHub App)
- 4-State Handoff FSM (pending → active → completed/failed)
- Engagement Level Governance (1-5)
- CODEOWNERS-based agent routing
- MCP Server with 6 tools
- Action Classification (T1-T5)
- Azure Container Apps deployment (azd + Bicep)
- Docker Compose for local development
- GH-AW automation workflows

See CHANGELOG.md for full details."

echo "Tag created successfully!"
echo ""
echo "To push the tag to GitHub:"
echo "  git push origin $VERSION"
echo ""
echo "After pushing, create a GitHub Release at:"
echo "  https://github.com/AgentCraftworks/AgentCraftworks-CE/releases/new?tag=$VERSION"
