const { join } = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
exports.default = async (context) => {
  const name = context.packager.appInfo.productFilename
  const mac = context.electronPlatformName === 'darwin'
  const target = mac
    ? join(context.appOutDir, `${name}.app`, 'Contents', 'MacOS', name)
    : join(context.appOutDir, `${name}.exe`)
  await flipFuses(target, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: mac,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  })
}
