targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment which is used to generate a short unique hash used in all resources.')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('Id of the user or app to assign application roles')
param principalId string = ''

@secure()
@description('GitHub Webhook Secret. Generate with: openssl rand -hex 32')
param ghWebhookSecret string

@secure()
@description('GitHub App ID')
param ghAppId string

@secure()
@description('GitHub App Private Key (PEM format)')
param ghAppPrivateKey string

@secure()
@description('Bearer token protecting the REST API (/api/handoffs, /api/dial). Generate with: openssl rand -hex 32')
param ghApiToken string

// Tags that should be applied to all resources
var tags = {
  'azd-env-name': environmentName
}

// Generate a unique token to be used in naming resources
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))

// Organize resources in a single resource group
resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

// Deploy the core infrastructure resources
module resources './resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
  }
}

// Deploy Key Vault for secrets
module keyVault './keyvault.bicep' = {
  name: 'keyvault'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    principalId: principalId
    ghWebhookSecret: ghWebhookSecret
    ghAppId: ghAppId
    ghAppPrivateKey: ghAppPrivateKey
    ghApiToken: ghApiToken
  }
}

// Deploy TypeScript Container App
// Community Edition keeps all handoff state in memory (see docs/architecture.md → Storage),
// so no database or cache is provisioned and the app runs as a single replica.
module appTs './app-ts.bicep' = {
  name: 'app-ts'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    containerAppsEnvironmentId: resources.outputs.containerAppsEnvironmentId
    containerRegistryName: resources.outputs.containerRegistryName
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

// Outputs
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.containerRegistryName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryLoginServer
output AZURE_KEY_VAULT_NAME string = keyVault.outputs.keyVaultName
output AZURE_CONTAINER_APP_NAME string = appTs.outputs.containerAppName
output TYPESCRIPT_APP_URL string = appTs.outputs.appUrl
