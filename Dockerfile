FROM node:24-slim

WORKDIR /app

# node_modules를 node 사용자 소유로 미리 만들어 둔다.
# compose의 named volume이 처음 생성될 때 이 소유권을 그대로 복사하므로
# 컨테이너 안에서 npm install 시 권한 오류(EACCES)가 나지 않는다.
RUN mkdir -p /app/node_modules && chown -R node:node /app
USER node

# package.json이 생기기 전에도 빌드되도록, 있을 때만 의존성을 설치한다.
COPY --chown=node:node . .
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f package.json ]; then npm install; \
    fi

EXPOSE 5173
CMD ["bash"]
