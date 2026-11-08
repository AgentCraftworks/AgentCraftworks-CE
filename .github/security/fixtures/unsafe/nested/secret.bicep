@secure()
param credential string

var alias = credential
output leakedCredential string = alias

resource redis 'Microsoft.Cache/redis@2023-08-01' existing = {
  name: 'example-redis'
}

output redisPrimaryKey string = redis.listKeys().primaryKey
