Set-Location 'd:\PROJECT-FINAL\Kiro\QR-CODE\backend'
$env:FILE_STORAGE_PATH = 'd:\PROJECT-FINAL\Kiro\QR-CODE\storage\files'
$env:METADATA_STORAGE_PATH = 'd:\PROJECT-FINAL\Kiro\QR-CODE\storage\metadata'
& mvn spring-boot:run 2>&1 | Tee-Object -FilePath 'd:\PROJECT-FINAL\Kiro\QR-CODE\.agents\backend.log'
