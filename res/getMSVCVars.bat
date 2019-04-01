@echo off

::
:: This script is used by the getMSVCVars private function, in kits.ts
:: It will output the environment variables after a marker,
:: then will call the vcvars script (passed as an argument) which sets
:: the enviornment for building with MSVC, and finally will output the
:: new environment variables after a second marker.
:: This will allow the extension to get the env vars needed to run a build.
::

echo "<<<before>>>"
set

echo "<<<banner>>>"
call %1

echo "<<<after>>>"
set
