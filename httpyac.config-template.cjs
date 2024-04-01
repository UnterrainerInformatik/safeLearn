// Configuration file for HttpYac.
// A plugin for VSCode.
// Switch environments by pressing CTRL+ALT+e while being on an open .http file.
module.exports = {
  log: {
    supportAnsiColors: true
  },
  cookieJarEnabled: true,
  envDirName: 'env',
  environments: {
    $default: {
      url: 'http://localhost:8080',
      oidc: 'https://auth.unterrainer.info/auth/realms/test/protocol/openid-connect/token',
      clientId: 'test',
      clientSecret: '5c06e7f4-20bc-44c4-a70d-7459d7d54f2b',
      userName: 'test',
      password: 'test'
    }
  }
}
