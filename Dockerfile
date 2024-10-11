# syntax=docker/dockerfile:1.4
FROM node:20-bullseye-slim as base

# internal docker build args for build date and dev mode
ARG IS_DEV
ARG BUILD_DATE
ENV IS_DEV=${IS_DEV}
ENV VITE_IS_DEV=${IS_DEV}
ENV BUILD_DATE=${BUILD_DATE}
ENV VITE_BUILD_DATE=${BUILD_DATE}

# make app folder
RUN mkdir -p /usr/local/share/twitchautomator \
    && chown node:node /usr/local/share/twitchautomator \
    && chmod 775 /usr/local/share/twitchautomator

RUN apt-get -y update \
    && apt-get install -y ffmpeg mediainfo python3 python3-pip python3-wheel libxml2-dev libxslt-dev python3-dev bash git curl unzip rclone --no-install-recommends \
    && apt-get clean

# copy over pipenv files and install dependencies for python
COPY ./Pipfile ./Pipfile.lock ./requirements.txt ./binaries.txt /usr/local/share/twitchautomator/
# install pipenv globally
RUN pip install pipenv && pip cache purge
# switch to node user to install pipenv dependencies
USER node
ENV PATH="${PATH}:/home/node/.local/bin"
RUN cd /usr/local/share/twitchautomator && \
    pipenv install --deploy --ignore-pipfile --verbose && \
    pipenv --version && \
    pipenv run python --version && \
    pipenv run streamlink --version

USER root

# remove dev packages
RUN apt-get remove -y libxml2-dev libxslt-dev python3-dev \
    && apt-get autoremove -y

FROM base as build

# make app folder
RUN mkdir -p /usr/local/share/twitchautomator \
    && chown -R node:node /usr/local/share/twitchautomator \
    && chmod -R 775 /usr/local/share/twitchautomator

USER node

# common
COPY --chown=node:node ./common /usr/local/share/twitchautomator/common

FROM build as build-chat-dumper

# chat dumper
COPY --chown=node:node ./twitch-chat-dumper /usr/local/share/twitchautomator/twitch-chat-dumper
RUN cd /usr/local/share/twitchautomator/twitch-chat-dumper \
    && yarn \
    && yarn build

FROM build as build-vod-chat

# vod player
COPY --chown=node:node ./twitch-vod-chat /usr/local/share/twitchautomator/twitch-vod-chat
RUN cd /usr/local/share/twitchautomator/twitch-vod-chat \
    && yarn install --immutable \
    && yarn build --base=/vodplayer \
    && yarn buildlib

FROM build as build-server

# server
COPY --chown=node:node ./server /usr/local/share/twitchautomator/server
RUN cd /usr/local/share/twitchautomator/server \
    && yarn \
    && yarn lint:ts \
    && yarn build \
    && yarn run generate-licenses

FROM build as build-client

# copy vod player dependencies
COPY --from=build-vod-chat \
    --chown=node:node \
    /usr/local/share/twitchautomator/twitch-vod-chat/ \
    /usr/local/share/twitchautomator/twitch-vod-chat/
COPY --from=build-server \
    --chown=node:node \
    /usr/local/share/twitchautomator/server/ \
    /usr/local/share/twitchautomator/server/

# USER root
# RUN ls -lAFh /usr/local/share/twitchautomator/twitch-vod-chat/dist-lib/twitch-vod-chat* && exit 1

# client
COPY --chown=node:node ./client-vue /usr/local/share/twitchautomator/client-vue
RUN cd /usr/local/share/twitchautomator/client-vue \
    && yarn \
    && yarn build \
    && yarn run generate-licenses

FROM base as final

# download twitchdownloader, is this legal? lmao
COPY ./docker/fetch-tdl.sh /tmp/fetch-tdl.sh
RUN bash /tmp/fetch-tdl.sh
ENV TCD_TWITCHDOWNLOADER_PATH=/usr/local/bin/TwitchDownloaderCLI

# download ttv-lol-plugin
COPY ./docker/fetch-ttv-lol.sh /tmp/fetch-ttv-lol.sh
RUN bash /tmp/fetch-ttv-lol.sh

# make home folder
RUN mkdir -p /home/node && chown node:node /home/node
ENV HOME /home/node

# fonts
RUN mkdir /home/node/.fonts && chown node:node /home/node/.fonts
COPY ./docker/fonts /home/node/.fonts

# chat dumper
COPY --from=build-chat-dumper \
    --chown=node:node \
    /usr/local/share/twitchautomator/twitch-chat-dumper/build/ \
    /usr/local/share/twitchautomator/twitch-chat-dumper/build/
COPY --from=build-chat-dumper \
    --chown=node:node \
    /usr/local/share/twitchautomator/twitch-chat-dumper/package.json \
    /usr/local/share/twitchautomator/twitch-chat-dumper/

# vod player
COPY --from=build-vod-chat \
    --chown=node:node \
    /usr/local/share/twitchautomator/twitch-vod-chat/dist/ \
    /usr/local/share/twitchautomator/twitch-vod-chat/dist/
COPY --from=build-vod-chat \
    --chown=node:node \
    /usr/local/share/twitchautomator/twitch-vod-chat/dist/ \
    /usr/local/share/twitchautomator/twitch-vod-chat/package.json \
    /usr/local/share/twitchautomator/twitch-vod-chat/

# server
COPY --from=build-server \
    --chown=node:node \
    /usr/local/share/twitchautomator/server/build/ \
    /usr/local/share/twitchautomator/server/build/
COPY --from=build-server \
    --chown=node:node \
    /usr/local/share/twitchautomator/server/tsconfig.json \
    /usr/local/share/twitchautomator/server/package.json \
    /usr/local/share/twitchautomator/server/LICENSES.txt \
    /usr/local/share/twitchautomator/server/

# client
COPY --from=build-client \
    --chown=node:node \
    /usr/local/share/twitchautomator/client-vue/dist/ \
    /usr/local/share/twitchautomator/client-vue/dist/
COPY --from=build-client \
    --chown=node:node \
    /usr/local/share/twitchautomator/client-vue/package.json \
    /usr/local/share/twitchautomator/client-vue/LICENSES.txt \
    /usr/local/share/twitchautomator/client-vue/

# twitchautomator docker specific configs
ENV TCD_BIN_DIR=/usr/local/bin
ENV TCD_FFMPEG_PATH=/usr/bin/ffmpeg
ENV TCD_BIN_PATH_PYTHON=/usr/bin/python
ENV TCD_BIN_PATH_PYTHON3=/usr/bin/python3
ENV TCD_MEDIAINFO_PATH=/usr/bin/mediainfo
ENV TCD_NODE_PATH=/usr/local/bin/node
ENV TCD_DOCKER=1
ENV TCD_WEBSOCKET_ENABLED=1
ENV TCD_SERVER_PORT=8080
ENV TCD_PYTHON_ENABLE_PIPENV=1

VOLUME [ "/usr/local/share/twitchautomator/data" ]
WORKDIR /usr/local/share/twitchautomator/server
ENTRYPOINT [ "node", "--enable-source-maps", "build/server.js" ]
EXPOSE 8080
