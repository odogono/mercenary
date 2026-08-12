counter = 0
return { hooks = { action = function(context) counter = counter + 1 return { state = {}, commands = {} } end } }
