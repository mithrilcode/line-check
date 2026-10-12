/**
 * JSON client for the Line Check API. Adds the CSRF header, turns error
 * responses into ApiError with the server's message, sends people to the
 * login page when their session ends, and reports save status for the header pill.
 * Exposed as LineCheck.api.
 */
(function (LC) {
  "use strict";

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  let pending = 0;
  let offline = false;
  const listeners = [];
  const notify = () => listeners.forEach((fn) => fn({ saving: pending > 0, offline }));

  async function request(method, path, body, extraHeaders = {}) {
    const write = method !== "GET";
    const headers = { "X-Requested-With": "fetch", ...extraHeaders };
    const options = { method, headers, credentials: "same-origin" };
    if (body instanceof Blob) options.body = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    if (write) {
      pending++;
      notify();
    }
    let res;
    try {
      res = await fetch(`/api${path}`, options);
      offline = false;
    } catch {
      offline = true;
      throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
    } finally {
      if (write) pending--;
      notify();
    }

    if (res.status === 401) {
      location.href = "/login.html";
      throw new ApiError(401, "Your session ended. Log in again.");
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || "Something went wrong. Try again.");
    return data;
  }

  LC.api = {
    ApiError,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    put: (path, body) => request("PUT", path, body ?? {}),
    patch: (path, body) => request("PATCH", path, body ?? {}),
    del: (path) => request("DELETE", path),
    /** Uploads a File; resolves { id, name }. */
    upload: (file) =>
      request("POST", "/files", file, {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
      }),
    onStatus: (fn) => listeners.push(fn),
  };
})((window.LineCheck = window.LineCheck || {}));
