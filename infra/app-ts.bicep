param location string
param tags object
param resourceToken string
param containerAppsEnvironmentId string
param containerRegistryName string
param keyVaultName string
param postgresHost string
param redisHost string
param redisPort int

@description('Container image to deploy. Defaults to a public placeholder for initial provisioning.')
param imageName string = ''

// azd uses this tag to map a service in azure.yaml to its deployed Azure resource.
var serviceTags = union(tags, {
  'azd-service-name': 'typescript-api'
})

// Container Registry reference
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' existing = {
  name: containerRegistryName
}

// Key Vault reference
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

// Managed Identity for the TypeScript app
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-app-ts-${resourceToken}'
  location: location
  tags: tags
}

// Assign Key Vault Secrets User role to the managed identity
resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity.id, 'SecretsUser')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Assign AcrPull role to the managed identity
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, managedIdentity.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// TypeScript Container App
// dependsOn ensures RBAC role assignments propagate before the Container App
// tries to pull secrets from Key Vault or images from ACR via managed identity.
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-ts-${resourceToken}'
  location: location
  tags: serviceTags
  dependsOn: [
    keyVaultSecretsUserRole
    acrPullRole
  ]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: managedIdentity.id
        }
      ]
      secrets: [
        {
          name: 'gh-webhook-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/GH-WEBHOOK-SECRET'
          identity: managedIdentity.id
        }
        {
          name: 'gh-app-id'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/GH-APP-ID'
          identity: managedIdentity.id
        }
        {
          name: 'gh-app-private-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/GH-APP-PRIVATE-KEY'
          identity: managedIdentity.id
        }
        {
          name: 'postgres-password'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/POSTGRES-PASSWORD'
          identity: managedIdentity.id
        }
        {
          name: 'redis-primary-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/REDIS-PRIMARY-KEY'
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'agentcraftworks-ts'
          image: !empty(imageName) ? imageName : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'GH_WEBHOOK_SECRET'
              secretRef: 'gh-webhook-secret'
            }
            {
              name: 'GH_APP_ID'
              secretRef: 'gh-app-id'
            }
            {
              name: 'GH_APP_PRIVATE_KEY'
              secretRef: 'gh-app-private-key'
            }
            {
              name: 'POSTGRES_HOST'
              value: postgresHost
            }
            {
              name: 'POSTGRES_DATABASE'
              value: 'agentcraftworks'
            }
            {
              name: 'POSTGRES_USER'
              value: 'agentcraftworks'
            }
            {
              name: 'POSTGRES_PASSWORD'
              secretRef: 'postgres-password'
            }
            {
              name: 'REDIS_HOST'
              value: redisHost
            }
            {
              name: 'REDIS_PORT'
              value: string(redisPort)
            }
            {
              name: 'REDIS_PASSWORD'
              secretRef: 'redis-primary-key'
            }
            {
              name: 'REDIS_SSL'
              value: 'true'
            }
          ]
          probes: [
            {
              type: 'liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 30
              periodSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'readiness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// Outputs
output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppName string = containerApp.name
output managedIdentityId string = managedIdentity.id
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
