FROM python:3.12-slim
WORKDIR /app
COPY index.html overlay.html dsn-core.js server.py sample-dsn.xml ./
RUN mkdir cache && chown nobody cache
USER nobody
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/', timeout=4)"
CMD ["python3", "server.py", "--bind", "0.0.0.0", "--port", "8080"]
