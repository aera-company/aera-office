// Showcase mode (C86): the public site has no office server behind it, so nothing here may call one.
// It runs on any address that is not this Mac. Adding ?vitrine to the local address previews it.
export const VITRINE=new URLSearchParams(location.search).has('vitrine')||!['127.0.0.1','localhost','[::1]'].includes(location.hostname);
