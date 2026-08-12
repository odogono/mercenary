return { hooks = { action = function(context) local result = {} for index = 1, 257 do result[index] = command.emitEvent("synthetic", index) end return { state = {}, commands = result } end } }
