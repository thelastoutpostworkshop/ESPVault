const fs = require("node:fs");
const path = require("node:path");
const ResEdit = require("resedit");

async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(context.packager.info.buildResourcesDir, "icon.ico");

  const executable = ResEdit.NtExecutable.from(fs.readFileSync(exePath), {
    ignoreCert: true,
  });
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(
    resources.entries,
  );
  const iconGroupId = iconGroups[0]?.id ?? 1;
  const iconLang = iconGroups[0]?.lang ?? 1033;

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    iconGroupId,
    iconLang,
    iconFile.icons.map((item) => item.data),
  );

  resources.outputResource(executable);
  fs.writeFileSync(exePath, Buffer.from(executable.generate()));
}

module.exports = afterPack;
module.exports.default = afterPack;
