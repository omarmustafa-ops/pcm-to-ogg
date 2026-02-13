FROM node:18-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Expose the port Railway uses
EXPOSE 8080

# Start the server
CMD [ "node", "server.js" ]
