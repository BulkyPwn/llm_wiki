import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcTauri = path.join(rootDir, "src-tauri");
const targetDir = path.join(srcTauri, "target", "release");

const NSIS_DIR = path.join(targetDir, "nsis", "x64");
const NSIS_BUNDLE_DIR = path.join(targetDir, "bundle", "nsis");
const WIX_DIR = path.join(targetDir, "wix", "x64");
const WIX_BUNDLE_DIR = path.join(targetDir, "bundle", "msi");

const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const MAKENSIS = path.join(LOCAL_APPDATA, "tauri", "NSIS", "Bin", "makensis.exe");
const WIX_TOOLS = path.join(LOCAL_APPDATA, "tauri", "WixTools314");
const LIGHT = path.join(WIX_TOOLS, "light.exe");
const CANDLE = path.join(WIX_TOOLS, "candle.exe");

function findTool(name, ...candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Tool not found: ${name}. Searched: ${candidates.join(", ")}`);
}

function repackageNsis() {
  const nsiFile = path.join(NSIS_DIR, "installer.nsi");
  if (!fs.existsSync(nsiFile)) {
    console.log("  [nsis] installer.nsi not found, skipping.");
    return;
  }

  if (!fs.existsSync(MAKENSIS)) {
    console.log("  [nsis] makensis.exe not found, skipping.");
    return;
  }

  // Determine output exe name from the nsi file
  const nsiContent = fs.readFileSync(nsiFile, "utf-8");
  const outFileMatch = nsiContent.match(/^!define\s+OUTFILE\s+"(.+)"$/m);
  const outFileName = outFileMatch ? outFileMatch[1] : path.basename(nsiFile, ".nsi") + ".exe";

  // Remove previous output if exists
  const prevExe = path.join(NSIS_DIR, outFileName);
  if (fs.existsSync(prevExe)) {
    fs.unlinkSync(prevExe);
  }

  console.log("  [nsis] Recompiling installer...");
  const cwd = NSIS_DIR;
  try {
    const result = execSync(`"${MAKENSIS}" installer.nsi`, {
      cwd,
      stdio: "pipe",
      env: { ...process.env },
      encoding: "utf-8",
    });
    console.log(result);
  } catch (e) {
    console.error("  [nsis] makensis stderr:", e.stderr?.toString() || "");
    console.error("  [nsis] makensis stdout:", e.stdout?.toString() || "");
    console.error("  [nsis] makensis failed:", e.message);
    return;
  }

  // Find the generated .exe
  const srcExe = path.join(NSIS_DIR, outFileName);
  if (!fs.existsSync(srcExe)) {
    console.error(`  [nsis] Output exe not found: ${srcExe}`);
    // Try glob
    const files = fs.readdirSync(NSIS_DIR).filter(f => f.endsWith(".exe") && !f.includes("uninstall"));
    if (files.length > 0) {
      const found = files[0];
      console.log(`  [nsis] Found alternative exe: ${found}`);
      const altSrc = path.join(NSIS_DIR, found);
      copyToBundle(NSIS_BUNDLE_DIR, altSrc, "-setup.exe");
      return;
    }
    return;
  }

  copyToBundle(NSIS_BUNDLE_DIR, srcExe, "-setup.exe");
}

function copyToBundle(bundleDir, srcExe, suffix) {
  fs.mkdirSync(bundleDir, { recursive: true });

  // Find existing installer in bundle directory and remove
  const existing = fs.readdirSync(bundleDir).filter(f => f.endsWith(suffix));
  for (const f of existing) {
    fs.unlinkSync(path.join(bundleDir, f));
  }

  const destName = existing[0] || "LLM Wiki" + suffix;
  const destExe = path.join(bundleDir, destName);
  fs.copyFileSync(srcExe, destExe);
  console.log(`  [nsis] Done → ${destExe}`);
}

function repackageWix() {
  const wxsFile = path.join(WIX_DIR, "main.wxs");
  const wixobjFile = path.join(WIX_DIR, "main.wixobj");
  const localeFile = path.join(WIX_DIR, "locale.wxl");

  if (!fs.existsSync(wxsFile)) {
    console.log("  [wix]  main.wxs not found, skipping.");
    return;
  }

  if (!fs.existsSync(CANDLE) || !fs.existsSync(LIGHT)) {
    console.log("  [wix]  WiX tools not found, skipping.");
    return;
  }

  // Step 1: candle.exe — compile .wxs → .wixobj
  // Note: locale.wxl is omitted; WiX 3 candle treats .wxl as invalid source.
  // The !(loc.xxx) references will fall back to empty/default values.
  console.log("  [wix]  Compiling .wxs -> .wixobj...");
  try {
    const args = [
      `"${wxsFile}"`,
      `-arch x64`,
      `-ext WixUIExtension`,
      `-ext WixUtilExtension`,
    ]
      .filter(Boolean)
      .join(" ");
    const result = execSync(`"${CANDLE}" ${args}`, {
      cwd: WIX_DIR,
      stdio: "pipe",
      env: { ...process.env },
      encoding: "utf-8",
    });
    console.log(result);
  } catch (e) {
    console.error("  [wix]  candle stderr:", e.stderr?.toString() || "");
    console.error("  [wix]  candle stdout:", e.stdout?.toString() || "");
    console.error("  [wix]  candle failed:", e.message);
    return;
  }

  if (!fs.existsSync(wixobjFile)) {
    console.error("  [wix]  main.wixobj not generated.");
    return;
  }

  // Step 2: light.exe — link .wixobj → .msi
  console.log("  [wix]  Linking .wixobj → .msi...");

  fs.mkdirSync(WIX_BUNDLE_DIR, { recursive: true });

  // Find existing installer name
  const existing = fs.readdirSync(WIX_BUNDLE_DIR).filter(f => f.endsWith(".msi"));
  const msiName = existing[0] || "LLM Wiki.msi";
  const msiOutput = path.join(WIX_BUNDLE_DIR, msiName);

  try {
    const args = [
      `"${wixobjFile}"`,
      `-out "${msiOutput}"`,
      fs.existsSync(localeFile) ? `-loc "${localeFile}"` : "",
      `-ext WixUIExtension`,
      `-ext WixUtilExtension`,
    ]
      .filter(Boolean)
      .join(" ");
    const result = execSync(`"${LIGHT}" ${args}`, {
      cwd: WIX_DIR,
      stdio: "pipe",
      env: { ...process.env },
      encoding: "utf-8",
    });
    console.log(result);
  } catch (e) {
    console.error("  [wix]  light stderr:", e.stderr?.toString() || "");
    console.error("  [wix]  light stdout:", e.stdout?.toString() || "");
    console.error("  [wix]  light failed:", e.message);
    return;
  }

  console.log(`  [wix]  Done → ${msiOutput}`);
}

function main() {
  console.log("[repackage] Rebuilding installers with PATH injection...\n");
  repackageNsis();
  console.log("");
  repackageWix();
  console.log("\n[repackage] Complete.");
}

try {
  main();
} catch (err) {
  console.error("[repackage] Fatal error:", err);
  process.exit(1);
}
