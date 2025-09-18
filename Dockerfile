FROM node:22-alpine
# Update all packages and install security updates
RUN apk update && apk upgrade --no-cache
RUN apk add git

WORKDIR /usr/src/app
COPY . /usr/src/app

RUN npm install
RUN git config --global --add safe.directory /usr/src/app

CMD ["node", "index.js"]
