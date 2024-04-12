FROM node
# update dependencies and install curl
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*
# Create app directory
WORKDIR /app
FROM node:alpine

# Make app directory in the container.
RUN mkdir /app

# Copy whole code to app directory.
COPY site/ /app
# Copy MD directory to app directory.
COPY md/ /app/md
# Copy the assets folder to app directory.
COPY assets/ /app/assets
# Copy the middlewares folder to app directory.
COPY middlewares/ /app/middlewares
# Copy the css folder to app directory.
COPY css/ /app/css

# Copy package.json app directory.
COPY package.json /app
COPY package-lock.json /app
COPY *.js /app
COPY *.css /app

# make app directory as the working directory.
WORKDIR /app

# Install dependencies.
RUN npm install -only=production

# Expose the port
EXPOSE 8080

# Start the process
CMD ["npm", "run", "prod"]