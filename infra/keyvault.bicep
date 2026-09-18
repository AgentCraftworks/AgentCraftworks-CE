param location string
param tags object
param resourceToken string
param principalId string

@secure()
@description('GitHub Webhook Secret - generate with: openssl rand -hex 32')
param ghWebhookSecret string

@secure()
@description('GitHub App ID')
param ghAppId string

@secure()
@description('GitHub App Private Key (PEM format)')
param ghAppPrivateKey string

@secure()
@description('Bearer token protecting the REST API (/api/handoffs, /api/dial)')
param ghApiToken string

// Key Vault for secrets
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: 'kv-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
  }
}

// Assign Key Vault Secrets User role to the principal
resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(principalId)) {
  name: guid(keyVault.id, principalId, 'SecretsUser')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: principalId
  }
}

// GitHub Webhook Secret
resource ghWebhookSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'GH-WEBHOOK-SECRET'
  properties: {
    value: ghWebhookSecret
  }
}

// GitHub App ID
resource ghAppIdResource 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'GH-APP-ID'
  properties: {
    value: ghAppId
  }
}

// GitHub App Private Key
resource ghAppPrivateKeyResource 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'GH-APP-PRIVATE-KEY'
  properties: {
    value: ghAppPrivateKey
  }
}

// REST API bearer token
resource ghApiTokenResource 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'GH-CE-API-TOKEN'
  properties: {
    value: ghApiToken
  }
}

// Output
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
