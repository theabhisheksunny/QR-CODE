FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
RUN mkdir -p /app/storage/files /app/storage/metadata
EXPOSE 8787
ENV FILE_STORAGE_PATH=/app/storage/files METADATA_STORAGE_PATH=/app/storage/metadata
ENTRYPOINT ["java", "-jar", "app.jar"]
