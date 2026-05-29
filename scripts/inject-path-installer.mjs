import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcTauri = path.join(rootDir, "src-tauri");

const NSIS_HOOK_POSTINSTALL = [
  "",
  "  ; ── PATH: add install dir ────────────────────────────────",
  "  ; Read current user PATH, append $INSTDIR if not present.",
  '  ReadRegStr $0 HKCU "Environment" "PATH"',
  '  ${StrLoc} $1 $0 "$INSTDIR" ">"',
  '  ${If} $1 == ""',
  '    ${If} $0 == ""',
  '      WriteRegExpandStr HKCU "Environment" "PATH" "$INSTDIR"',
  "    ${Else}",
  '      WriteRegExpandStr HKCU "Environment" "PATH" "$0;$INSTDIR"',
  "    ${EndIf}",
  '    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000',
  "  ${EndIf}",
  "  ; ─────────────────────────────────────────────────────────",
  "",
].join("\n");

const NSIS_HOOK_PREUNINSTALL = [
  "",
  "  ; ── PATH: remove install dir ────────────────────────────",
  '  ReadRegStr $0 HKCU "Environment" "PATH"',
  '  ${If} $0 != ""',
  '    ${WordReplace} $0 ";$INSTDIR;" ";" "+*" $1',
  '    ${WordReplace} $1 ";$INSTDIR" "" "+*" $2',
  '    ${WordReplace} $2 "$INSTDIR;" "" "+*" $3',
  '    ${WordReplace} $3 "$INSTDIR" "" "+*" $4',
  '    ${If} $4 != $0',
  '      WriteRegExpandStr HKCU "Environment" "PATH" "$4"',
  '      SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000',
  "    ${EndIf}",
  "  ${EndIf}",
  "  ; ─────────────────────────────────────────────────────────",
  "",
].join("\n");

function injectNsisHooks(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");

  if (content.includes("─ PATH:")) {
    console.log(`  [nsis] PATH hooks already present, skipping.`);
    return;
  }

  // Check that required includes exist
  if (!content.includes("WordFunc.nsh")) {
    console.warn("  [nsis] WARNING: WordFunc.nsh not found, PATH removal may fail.");
  }
  if (!content.includes("StrFunc.nsh")) {
    console.warn("  [nsis] WARNING: StrFunc.nsh not found, PATH add may fail.");
  }

  // Define the NSIS_HOOK_* macros before Section Install.
  // The Tauri-generated installer.nsi already has !ifmacrodef/!insertmacro
  // call sites that will expand these macros automatically.
  const installSectionStart = "Section Install";
  const installStartIdx = content.indexOf(installSectionStart);
  if (installStartIdx === -1) {
    console.error("  [nsis] ERROR: 'Section Install' not found.");
    return;
  }

  const macroBlock = [
    "",
    "!macro NSIS_HOOK_POSTINSTALL",
    NSIS_HOOK_POSTINSTALL,
    "!macroend",
    "",
    "!macro NSIS_HOOK_PREUNINSTALL",
    NSIS_HOOK_PREUNINSTALL,
    "!macroend",
    "",
  ].join("\n");

  content =
    content.slice(0, installStartIdx) + macroBlock + content.slice(installStartIdx);

  fs.writeFileSync(filePath, content);
  console.log(`  [nsis] PATH hooks injected.`);
}

function injectWixEnvironment(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");

  // Skip if already processed
  if (content.includes('Component Id="EnvPathComponent"')) {
    console.log(`  [wix]  PATH feature already configured, skipping.`);
    return;
  }

  // ── Step 1: Switch WixUI from InstallDir to Advanced ──
  // WixUI_Advanced includes both FeaturesDlg (feature tree) and InstallDirDlg.
  const oldUIRef = '<UIRef Id="WixUI_InstallDir" />';
  const newUIRef = '<UIRef Id="WixUI_Advanced" />';

  if (content.includes(oldUIRef)) {
    content = content.replace(oldUIRef, newUIRef);

    // Dialog flow with WixUI_Advanced:
    // Default: WelcomeDlg → LicenseAgreementDlg → InstallScopeDlg → InstallDirDlg → FeaturesDlg → VerifyReadyDlg → ...
    // We want: WelcomeDlg → InstallDirDlg → FeaturesDlg → VerifyReadyDlg → ... (skip license and scope)
    const oldNav = [
      '            <!-- Skip license dialog -->',
      '            <Publish Dialog="WelcomeDlg"',
      '                     Control="Next"',
      '                     Event="NewDialog"',
      '                     Value="InstallDirDlg"',
      '                     Order="2">1</Publish>',
      '            <Publish Dialog="InstallDirDlg"',
      '                     Control="Back"',
      '                     Event="NewDialog"',
      '                     Value="WelcomeDlg"',
      '                     Order="2">1</Publish>',
    ].join("\n");

    const newNav = [
      '            <!-- Skip license dialog, go WelcomeDlg → InstallDirDlg → FeaturesDlg -->',
      '            <Publish Dialog="WelcomeDlg"',
      '                     Control="Next"',
      '                     Event="NewDialog"',
      '                     Value="InstallDirDlg"',
      '                     Order="2">1</Publish>',
      '            <!-- Skip InstallScopeDlg: InstallDirDlg back → WelcomeDlg -->',
      '            <Publish Dialog="InstallDirDlg"',
      '                     Control="Back"',
      '                     Event="NewDialog"',
      '                     Value="WelcomeDlg"',
      '                     Order="2">1</Publish>',
      '            <!-- After InstallDirDlg, go to FeaturesDlg (feature tree) -->',
      '            <Publish Dialog="InstallDirDlg"',
      '                     Control="Next"',
      '                     Event="NewDialog"',
      '                     Value="FeaturesDlg"',
      '                     Order="1">1</Publish>',
      '            <!-- FeaturesDlg back goes to InstallDirDlg -->',
      '            <Publish Dialog="FeaturesDlg"',
      '                     Control="Back"',
      '                     Event="NewDialog"',
      '                     Value="InstallDirDlg"',
      '                     Order="1">1</Publish>',
    ].join("\n");

    if (content.includes(oldNav)) {
        content = content.replace(oldNav, newNav);
        // Add required properties for WixUI_Advanced
        // WixUI_Advanced already defines WIXUI_INSTALLDIR internally, so remove ours
        content = content.replace(
          '            <Property Id="WIXUI_INSTALLDIR" Value="INSTALLDIR" />\n',
          '            <!-- WIXUI_INSTALLDIR provided by WixUI_Advanced -->\n'
        );
        const uiBlock = content.indexOf('<UI>');
        const firstPublish = content.indexOf('<Publish', uiBlock);
        if (firstPublish !== -1) {
          const props = [
            '            <Property Id="ApplicationFolderName" Value="LLM Wiki" />',
            '            <Property Id="WixAppFolder" Value="WixPerMachineFolder" />',
          ];
          let before = content.slice(0, firstPublish);
          if (!before.includes('ApplicationFolderName')) {
            const insert = '\n' + props.join('\n') + '\n\n';
            content = content.slice(0, firstPublish) + insert + content.slice(firstPublish);
          }
        }
        console.log(`  [wix]  Switched UI to WixUI_Advanced (FeaturesDlg + InstallDirDlg).`);
    } else {
      // Try with different line endings or indentation
      console.log(`  [wix]  Dialog nav not in expected format; injecting anyway.`);
      // Replace the UI block contents manually
      const uiEndMarker = '        </UI>';
      const uiStartMarker = '        <UI>';
      const uiStartIdx = content.indexOf(uiStartMarker);
      const uiEndIdx = content.indexOf(uiEndMarker, uiStartIdx);
      if (uiStartIdx !== -1 && uiEndIdx !== -1) {
        // Build replacement UI block
        const newUI = [
          '        <UI>',
           '            <!-- launch app checkbox -->',
           '            <Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="LaunchApplication">WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1 and NOT Installed</Publish>',
           '',
           '            <Property Id="ApplicationFolderName" Value="LLM Wiki" />',
           '            <Property Id="WixAppFolder" Value="WixPerMachineFolder" />',
           '',
           '            <!-- Flow: WelcomeDlg → InstallDirDlg → FeaturesDlg → VerifyReadyDlg -->',
          '            <Publish Dialog="WelcomeDlg"',
          '                     Control="Next"',
          '                     Event="NewDialog"',
          '                     Value="InstallDirDlg"',
          '                     Order="2">1</Publish>',
          '            <Publish Dialog="InstallDirDlg"',
          '                     Control="Back"',
          '                     Event="NewDialog"',
          '                     Value="WelcomeDlg"',
          '                     Order="2">1</Publish>',
          '            <Publish Dialog="InstallDirDlg"',
          '                     Control="Next"',
          '                     Event="NewDialog"',
          '                     Value="FeaturesDlg"',
          '                     Order="1">1</Publish>',
          '            <Publish Dialog="FeaturesDlg"',
          '                     Control="Back"',
          '                     Event="NewDialog"',
          '                     Value="InstallDirDlg"',
          '                     Order="1">1</Publish>',
          '        </UI>',
        ].join("\n");
        content = content.slice(0, uiStartIdx) + newUI + content.slice(uiEndIdx + uiEndMarker.length);
        console.log(`  [wix]  Rebuilt UI block for WixUI_Advanced.`);
      }
    }
  }

  // ── Step 2: Remove placeholder Environment Feature (left from Tauri template) ──
  const envFeaturePattern = /[\t ]*<Feature\s+Id="Environment"[\s\S]*?\/Feature>\s*/g;
  if (envFeaturePattern.test(content)) {
    content = content.replace(envFeaturePattern, "");
    console.log(`  [wix]  Removed placeholder Environment Feature.`);
  }

  // ── Step 3: Remove any stale <Environment> from Path component ──
  const staleEnvInPath = /[\t ]*<Environment\s+Id="EnvPath"[^>]*\/>\s*/g;
  if (staleEnvInPath.test(content)) {
    content = content.replace(staleEnvInPath, "");
    console.log(`  [wix]  Removed stale <Environment> from Path component.`);
  }

  // ── Step 4: Create EnvPathComponent + Environment Feature ──
  // Insert the new component right after the RegistryEntries component inside <DirectoryRef Id="INSTALLDIR">
  const registryEnd = "</Component>";
  const dirRefStart = '<DirectoryRef Id="INSTALLDIR">';
  const dirRefIdx = content.indexOf(dirRefStart);
  if (dirRefIdx === -1) {
    console.error("  [wix]  ERROR: DirectoryRef INSTALLDIR not found.");
    return;
  }

  // Find end of RegistryEntries component (first </Component> after dirRefStart)
  const afterDirRef = content.slice(dirRefIdx);
  const firstClose = afterDirRef.indexOf(registryEnd);
  if (firstClose === -1) {
    console.error("  [wix]  ERROR: Could not find RegistryEntries close tag.");
    return;
  }
  const insertPos = dirRefIdx + firstClose + registryEnd.length;

  const envComponent = [
    "",
    "            <Component Id=\"EnvPathComponent\" Guid=\"*\" Win64=\"$(var.Win64)\">",
    "                <Environment Id=\"EnvPath\"",
    "                             Name=\"PATH\"",
    "                             Action=\"set\"",
    "                             Part=\"last\"",
    '                             Value="[INSTALLDIR]"',
    '                             System="yes" />',
    "                <RegistryValue Root=\"HKCU\"",
    '                               Key="Software\\llmwiki\\LLM Wiki"',
    '                               Name="PathEnv"',
    '                               Type="integer"',
    '                               Value="1"',
    '                               KeyPath="yes" />',
    "            </Component>",
    "",
  ].join("\n");

  content = content.slice(0, insertPos) + envComponent + content.slice(insertPos);

  // ── Step 5: Add Environment Feature before the closing </Feature> of MainProgram ──
  // Find the closing </Feature> of the outermost Feature (MainProgram).
  // Strategy: find <Feature Id="MainProgram", then find balanced </Feature>
  const mainProgStart = '<Feature\r\n                Id="MainProgram"';
  const mainIdx = content.indexOf(mainProgStart);
  if (mainIdx === -1) {
    console.error("  [wix]  ERROR: MainProgram Feature not found.");
    return;
  }

  // Simple approach: find the LAST </Feature> after the ShortcutsFeature
  const shortcutsFeatureStart = '            <Feature Id="ShortcutsFeature"';
  const shortcutsIdx = content.indexOf(shortcutsFeatureStart);
  if (shortcutsIdx === -1) {
    console.error("  [wix]  ERROR: ShortcutsFeature not found.");
    return;
  }

  const afterShortcuts = content.slice(shortcutsIdx);
  // Find the closing </Feature> of ShortcutsFeature
  let depth2 = 1;
  let pos2 = afterShortcuts.indexOf(">") + 1;
  while (depth2 > 0 && pos2 < afterShortcuts.length) {
    const nextOpen = afterShortcuts.indexOf("<Feature ", pos2);
    const nextClose = afterShortcuts.indexOf("</Feature>", pos2);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth2++;
      pos2 = nextOpen + "<Feature ".length;
    } else {
      depth2--;
      if (depth2 === 0) {
        pos2 = nextClose;
        break;
      }
      pos2 = nextClose + "</Feature>".length;
    }
  }

  if (depth2 !== 0) {
    console.error("  [wix]  ERROR: Could not find ShortcutsFeature closing tag, depth=" + depth2);
    return;
  }

  const absShortcutsClose = shortcutsIdx + pos2 + "</Feature>".length;

  const envFeature = [
    "",
    "            <Feature",
    '                Id="Environment"',
    '                Title="Add to system PATH"',
    '                Description="Add LLM Wiki installation directory to the system PATH environment variable so you can run llm-wiki from any terminal."',
    '                Level="1"',
    '                Absent="allow">',
    '                <ComponentRef Id="EnvPathComponent"/>',
    "            </Feature>",
    "",
  ].join("\n");

  content = content.slice(0, absShortcutsClose) + envFeature + content.slice(absShortcutsClose);

  fs.writeFileSync(filePath, content);
  console.log(`  [wix]  PATH Feature + EnvPathComponent injected.`);
}

async function main() {
  console.log("[inject-path] Searching for generated installer scripts...\n");

  // Find NSIS installer.nsi
  const nsiPatterns = [
    path.join(srcTauri, "target", "**", "nsis", "**", "installer.nsi"),
  ];

  let found = false;
  try {
    for (const pattern of nsiPatterns) {
      for await (const file of glob(pattern)) {
        found = true;
        injectNsisHooks(file);
      }
    }
  } catch (e) {
    // glob may not be available; try manual paths
  }

  if (!found) {
    // Try common paths
    const commonNsiPaths = [
      path.join(srcTauri, "target", "release", "nsis", "x64", "installer.nsi"),
      path.join(srcTauri, "target", "release", "bundle", "nsis", "installer.nsi"),
    ];
    for (const p of commonNsiPaths) {
      if (fs.existsSync(p)) {
        injectNsisHooks(p);
        found = true;
      }
    }
  }

  if (!found) {
    console.log("  [nsis] No installer.nsi found (may not have built NSIS target).");
  }

  // Find WiX main.wxs
  let wixFound = false;
  const commonWxsPaths = [
    path.join(srcTauri, "target", "release", "wix", "x64", "main.wxs"),
    path.join(srcTauri, "target", "release", "bundle", "wix", "main.wxs"),
  ];
  for (const p of commonWxsPaths) {
    if (fs.existsSync(p)) {
      injectWixEnvironment(p);
      wixFound = true;
    }
  }

  if (!wixFound) {
    console.log("  [wix]  No main.wxs found (may not have built MSI target).");
  }

  console.log("\n[inject-path] Done.");
}

main().catch((err) => {
  console.error("[inject-path] Fatal error:", err);
  process.exit(1);
});
