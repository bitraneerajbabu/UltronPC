#ifndef AppVersion
#define AppVersion "1.1"
#endif

[Setup]
AppId={{5A8F7B5E-329A-48B8-9A70-22D2D794F638}
AppName=UltrON
AppVersion={#AppVersion}
AppPublisher=Sunshine Technologies
AppPublisherURL=https://sunshinetechno.com/
AppSupportURL=mailto:tst@sunshinetechno.com
DefaultDirName={autopf}\UltrON
DisableProgramGroupPage=yes
LicenseFile=EULA.rtf
PrivilegesRequired=admin
OutputDir=dist
OutputBaseFilename=UltrON_Setup_v{#AppVersion}
SetupIconFile=backend\ultron_backend\ultron.ico
WizardStyle=modern
WizardImageFile=wizard_image.bmp
WizardSmallImageFile=wizard_small.bmp
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64

CloseApplications=yes
RestartApplications=no

[Code]
// Automatically close any running UltrON instance before starting installation
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM UltrON.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(500);
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM UltrON.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(500);
  Result := '';
end;

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
; Create ProgramData directory with modify permissions for users so the app can write its database and logs.
; uninsneveruninstall guarantees it's preserved on upgrade/uninstall.
Name: "{commonappdata}\UltrON"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\UltrON\logs"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\UltrON\backups"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\UltrON\reports"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\UltrON\cpcb"; Permissions: users-modify; Flags: uninsneveruninstall

[Files]
Source: "backend\ultron_backend\dist\UltrON.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "plants\Berger 2\ultron.db"; DestDir: "{commonappdata}\UltrON"; DestName: "ultron.db"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{autoprograms}\UltrON"; Filename: "{app}\UltrON.exe"
Name: "{autodesktop}\UltrON"; Filename: "{app}\UltrON.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\UltrON.exe"; Description: "{cm:LaunchProgram,UltrON}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Ensure we don't accidentally wipe ProgramData during an uninstall.
; Inno Setup by default only removes {app}, but it's good to be explicit about preserving data.
Type: files; Name: "{app}\*.*"
Type: dirifempty; Name: "{app}"
