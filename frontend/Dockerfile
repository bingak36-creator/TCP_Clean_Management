# Stage 1: Build the React application
FROM node:18-alpine AS build
WORKDIR /app
# 패키지 파일을 먼저 복사하여 npm install 캐싱
COPY package*.json ./
RUN npm install
# 나머지 코드 복사 후 빌드 (Vite의 경우 npm run build 결과물이 dist 폴더에 생길 수 있음)
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# 빌드된 정적 파일들을 Nginx의 기본 서빙 폴더로 복사합니다 (CRA 기준 build 폴더)
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
