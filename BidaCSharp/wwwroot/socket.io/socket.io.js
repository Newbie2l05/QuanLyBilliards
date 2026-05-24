window.io = function () {
    const handlers = {};
    return {
        on: function (event, callback) {
            handlers[event] = callback;
            return this;
        },
        emit: function () { return this; },
        disconnect: function () { return this; }
    };
};
