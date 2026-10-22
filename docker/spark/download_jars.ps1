# ==============================================================================
# Midas Lakehouse - PowerShell Script de Descarga de JARs para Spark & Iceberg
# ==============================================================================
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = Join-Path $scriptDir "jars"

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$mavenRepo = "https://repo1.maven.org/maven2"

$jars = @(
    "org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/1.5.0/iceberg-spark-runtime-3.5_2.12-1.5.0.jar",
    "org/apache/hadoop/hadoop-aws/3.3.4/hadoop-aws-3.3.4.jar",
    "com/amazonaws/aws-java-sdk-bundle/1.12.367/aws-java-sdk-bundle-1.12.367.jar"
)

Write-Host "Descargando JARs hacia: $targetDir"

foreach ($jar in $jars) {
    $fileName = Split-Path -Leaf $jar
    $dest = Join-Path $targetDir $fileName
    if (Test-Path $dest) {
        Write-Host "  [OK] $fileName ya existe."
    } else {
        Write-Host "  [DESCARGANDO] $fileName..."
        $url = "$mavenRepo/$jar"
        Invoke-WebRequest -Uri $url -OutFile $dest
        Write-Host "  [LISTO] $fileName"
    }
}

Write-Host "Descarga de JARs completada exitosamente."
