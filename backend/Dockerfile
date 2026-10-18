# Build the Spring Boot application.
FROM gradle:8.7-jdk17 AS build
WORKDIR /app
COPY build.gradle settings.gradle ./
COPY gradle ./gradle
COPY gradlew ./
COPY src ./src
RUN ./gradlew bootJar --no-daemon

# Python hosts the bundled sklearn models; Java supervises the private inference process.
FROM python:3.14-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ai/requirements.txt ./ai/requirements.txt
RUN python -m pip install --no-cache-dir -r ai/requirements.txt
COPY ai ./ai
COPY --from=build /app/build/libs/*.jar app.jar
ENV PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
# The app only reads /app; run it without root privileges.
RUN useradd --system --uid 10001 --no-create-home app
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
