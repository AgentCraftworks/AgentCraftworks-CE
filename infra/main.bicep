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
@description('PostgreSQL administrator password. Generate with: openssl rand -base64 32')
param postgresPassword string

@secure()
@description('GitHub Webhook Secret. Generate with: openssl rand -hex 32')
param ghWebhookSecret string

@secure()
@description('GitHub App ID')
param ghAppId string

@secure()
@description('GitHub App Private Key (PEM format)')
param ghAppPrivateKey string

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
    postgresPassword: postgresPassword
    redisPrimaryKey: redis.outputs.redisPrimaryKey
  }
}

// Deploy PostgreSQL database
module postgres './postgres.bicep' = {
  name: 'postgres'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    postgresPassword: postgresPassword
  }
}

// Deploy Redis cache
module redis './redis.bicep' = {
  name: 'redis'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
  }
}

// Deploy TypeScript Container App
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
    postgresHost: postgres.outputs.postgresHost
    redisHost: redis.outputs.redisHost
    redisPort: redis.outputs.redisPort
  }
}

// Outputs
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.containerRegistryName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryLoginServer
output AZURE_KEY_VAULT_NAME string = keyVault.outputs.keyVaultName
output AZURE_POSTGRES_HOST string = postgres.outputs.postgresHost
output AZURE_REDIS_HOST string = redis.outputs.redisHost
output AZURE_CONTAINER_APP_NAME string = appTs.outputs.containerAppName
output TYPESCRIPT_APP_URL string = appTs.outputs.appUrl
