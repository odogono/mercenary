return { hooks = { action = function(context) return { state = setmetatable({}, { __index = function() return 1 end }), commands = {} } end } }
