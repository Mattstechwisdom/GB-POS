!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var InstallInstructions
Var InstructionsCheckbox

Function InstructionsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u "Optional shop resources"
  Pop $0
  CreateFont $1 "$(^Font)" "11" "700"
  SendMessage $0 ${WM_SETFONT} $1 1

  ${NSD_CreateLabel} 0 32u 100% 30u "Choose whether to place the current GadgetBoy POS operating manual in Documents and add a desktop shortcut."
  Pop $0

  ${NSD_CreateCheckbox} 0 72u 100% 18u "Install GadgetBoy POS Instructions (recommended)"
  Pop $InstructionsCheckbox
  ${NSD_SetState} $InstructionsCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function InstructionsPageLeave
  ${NSD_GetState} $InstructionsCheckbox $InstallInstructions
FunctionEnd

!macro customPageAfterChangeDir
  Page custom InstructionsPageCreate InstructionsPageLeave
!macroend

!macro customInstall
  ${If} $InstallInstructions == ${BST_CHECKED}
    CreateDirectory "$DOCUMENTS\GadgetBoy POS"
    CopyFiles /SILENT "$INSTDIR\resources\GadgetBoy-POS-Instructions.pdf" "$DOCUMENTS\GadgetBoy POS\GadgetBoy POS Instructions.pdf"
    CreateShortCut "$DESKTOP\GadgetBoy POS Instructions.lnk" "$DOCUMENTS\GadgetBoy POS\GadgetBoy POS Instructions.pdf"
  ${EndIf}
!macroend
!endif
