/**
 * The setup every server-sent event stream of the application shares: the
 * headers, flushing them at once, and forgetting the client when it goes.
 * Used by `/hot-reload` in `app.js` and by the exam module's live view
 * (`exam/routes-live.js`), which stay two separate streams - the hot-reload
 * channel answers without authentication and never carries exam data.
 */

/**
 * Turns `res` into an event stream for `req`. `headers` are added to the
 * stream's own (for example `X-Accel-Buffering` for a buffering proxy);
 * `onClose` runs once when the client goes. Answers the stream:
 *
 *   send(event, data)  one event with JSON data
 *   comment(text)      a comment line, which keeps the connection alive
 *   close()            ends the stream from the server's side
 */
export function openEventStream(req, res, { headers = {}, onClose = () => {} } = {}) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...headers,
  });
  res.flushHeaders();
  res.write("\n");

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    onClose();
  };
  req.on("close", finish);

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    comment(text) {
      if (closed) return;
      res.write(`: ${text}\n\n`);
    },
    close() {
      finish();
      res.end();
    },
    get closed() {
      return closed;
    },
  };
}
