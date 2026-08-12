local function recurse(value) return recurse(value + 1) end
return { hooks = { action = function(context) return recurse(0) end } }
