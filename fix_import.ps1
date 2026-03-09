$file = "src\pages\Admin.tsx"
$lines = Get-Content $file
$newLine = 'import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";'
$idx = ($lines | Select-String -Pattern 'import \{ toast \} from').LineNumber - 1
$output = $lines[0..($idx-1)] + $newLine + $lines[$idx..($lines.Length-1)]
$output | Set-Content $file
Write-Host "Done. Inserted import at index $idx"
