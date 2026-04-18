@ECHO OFF
SET DIRNAME=%~dp0
SET APP_HOME=%DIRNAME%

IF NOT "%JAVA_HOME%"=="" GOTO findJavaFromJavaHome
SET JAVA_EXE=java.exe
GOTO execute

:findJavaFromJavaHome
SET JAVA_EXE=%JAVA_HOME%\bin\java.exe

:execute
"%JAVA_EXE%" -Dorg.gradle.appname=gradlew -classpath "%APP_HOME%\gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
